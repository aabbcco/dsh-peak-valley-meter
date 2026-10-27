import test from 'node:test'
import assert from 'node:assert/strict'
import { createUsageProjection, normalizeUsage, estimateCostCny, MAX_USAGE_ITEMS } from '../lib/usage.js'

const start = Date.parse('2026-10-27T08:59:59+08:00')
const usage = { inputTokens: 100, outputTokens: 50, cacheReadTokens: 200 }
const chunk = value => ({ type: 'chunk', time: start, chunk: { type: 'usage', usage: value } })
const source = { kind: 'model', provider: 'deepseek', model: 'deepseek-flash' }
function harness(id = 'session-a', inherited = 0) {
  const projection = createUsageProjection()
  let state = projection.init({ id }, inherited)
  let seq = 0
  return {
    projection,
    get state() { return state },
    get view() { return projection.wire.view(state) },
    restore() { state = projection.stateSchema.parse(JSON.parse(JSON.stringify(state))) },
    add(type, data = {}, time = start) {
      const event = { type, data, time, seq: seq++ }
      state = projection.apply(state, event)
      return event
    },
    header(provider = 'deepseek', model = 'deepseek-flash') {
      this.add('request/header', { header: { config: { provider, model } } })
    },
    begin(step = 1, time = start) { this.add('step/start', { turn: 1, step }, time) },
    finish(value = usage, step = 1, extra = {}, time = start + 2_000) {
      return this.add('assistant/message', { turn: 1, step, stream: [], usage: value,
        message: { source }, ...extra }, time)
    },
  }
}

test('finalized samples replace same attempt without repeated animation identity', () => {
  const h = harness()
  h.header()
  h.begin()
  h.finish()
  const first = h.view.items[0]
  const before = h.view
  h.finish()
  assert.equal(h.view, before)
  h.finish({ ...usage, outputTokens: 20 })
  assert.equal(h.view.items.length, 1)
  assert.equal(h.view.items[0].tokens, 320)
  assert.equal(h.view.items[0].id, first.id)
  assert.equal(h.view.items[0].seq, first.seq)
  assert.equal(h.view.items[0].at, first.at)
  const old = h.state
  const replay = { type: 'assistant/message', seq: 2, time: start, data: { turn: 1, step: 1, usage } }
  assert.equal(h.projection.apply(old, replay), old)
})

test('retry attempts are distinct and use retry-start tariff', () => {
  const h = harness()
  h.header()
  h.begin()
  h.add('assistant/attempt', { turn: 1, step: 1, stream: [chunk(usage)] }, start + 500)
  const first = h.view.items[0]
  const retry = h.add('llm/retry-started', { turn: 1, step: 1, attempt: 1 }, start + 1_000)
  const state = h.state
  assert.equal(h.projection.apply(state, retry), state)
  h.finish(usage, 1, {}, start + 2_000)
  const [a, b] = h.view.items
  assert.equal(h.view.items.length, 2)
  assert.equal(a, first)
  assert.notEqual(a.id, b.id)
  assert.equal(a.costCny, 0.000304)
  assert.equal(b.costCny, 0.000608)
  assert.equal(b.startedAt, retry.time)
})

test('only final embedded usage chunk contributes; explicit message usage wins', () => {
  const h = harness()
  h.header()
  h.begin()
  const before = h.view
  h.add('agent/assistant-stream', { chunk: { type: 'usage', usage } })
  assert.equal(h.view, before)
  h.add('assistant/attempt', { turn: 1, step: 1,
    stream: [chunk({ ...usage, outputTokens: 2 }), chunk(usage)] })
  assert.equal(h.view.items[0].tokens, 350)
  h.finish({ ...usage, outputTokens: 5 }, 1, { stream: [chunk(usage)] })
  assert.equal(h.view.items[0].tokens, 305)
  assert.equal(h.view.items.length, 1)
})

test('missing or invalid last usage emits nothing and does not reuse a prior chunk', () => {
  const h = harness()
  h.begin()
  const before = h.view
  h.finish(undefined, 1, { usage: undefined })
  h.add('assistant/attempt', { turn: 1, step: 1,
    stream: [chunk(usage), chunk({ ...usage, inputTokens: NaN })] })
  h.add('tool/result', { usage })
  h.add('user/message', { usage })
  assert.equal(h.view, before)
})

test('safe integer tokens count cache once and include reasoning only through output', () => {
  assert.equal(normalizeUsage({ ...usage, totalTokens: 350, reasoningTokens: 30 }).tokens, 350)
  assert.equal(normalizeUsage({ inputTokens: 1, outputTokens: 2, cacheWriteTokens: 3 }).tokens, 6)
  for (const sample of [
    { inputTokens: 0, outputTokens: 0 },
    { ...usage, inputTokens: -1 }, { ...usage, outputTokens: Infinity },
    { ...usage, cacheReadTokens: NaN }, { ...usage, cacheWriteTokens: -1 },
    { ...usage, inputTokens: 0.5 }, { ...usage, reasoningTokens: 51 },
    { ...usage, totalTokens: 351 }, { ...usage, totalTokens: Infinity },
    { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 1 },
    { ...usage, cacheReadTokens: Number.MAX_SAFE_INTEGER + 1 },
  ]) assert.equal(normalizeUsage(sample), null)
})

test('cost follows request start across both peak boundaries', () => {
  const h = harness()
  h.begin()
  h.finish()
  assert.equal(h.view.items[0].costCny, 0.000304)
  h.begin(2, Date.parse('2026-10-27T11:59:59+08:00'))
  h.finish(usage, 2, {}, Date.parse('2026-10-27T12:00:01+08:00'))
  assert.equal(h.view.items[1].costCny, 0.000608)
  assert.equal(estimateCostCny('deepseek', 'deepseek-v4-flash', usage, start), 0.000304)
  assert.equal(estimateCostCny('deepseek', 'deepseek-v4-pro', usage, start), 0.001155)
})

test('unsupported model/provider, unknown cache/start/calendar yield null cost, not zero', () => {
  for (const [provider, model, value, at] of [
    ['other', 'deepseek-flash', usage, start], ['deepseek', 'other', usage, start],
    ['deepseek', null, usage, start], ['deepseek', 'deepseek-flash', usage, null],
    ['deepseek', 'deepseek-flash', { inputTokens: 1, outputTokens: 2 }, start],
    ['deepseek', 'deepseek-flash', { ...usage, cacheWriteTokens: 1 }, start],
    ['deepseek', 'deepseek-flash', usage, Date.parse('2027-01-02T10:00:00+08:00')],
  ]) assert.equal(estimateCostCny(provider, model, value, at), null)
  const h = harness()
  h.header()
  h.begin()
  h.finish(usage, 1, { message: { source: { provider: 'other', model: 'other' } } })
  assert.equal(h.view.items[0].tokens, 350)
  assert.equal(h.view.items[0].costCny, null)
  assert.equal(h.view.items[0].provider, 'other')
})

test('missing source/model is never guessed and missing starts stay uncertain', () => {
  const h = harness()
  h.finish(usage, 1, { message: { source: { provider: 'deepseek' } } })
  assert.equal(h.view.items[0].model, null)
  assert.equal(h.view.items[0].startedAt, null)
  assert.equal(h.view.items[0].costCny, null)
  h.begin(2)
  h.finish(usage, 2, { message: {} })
  assert.equal(h.view.items[1].provider, null)
  assert.equal(h.view.items[1].model, null)
})

test('busy sessions keep only twelve records and bounded current-attempt state', () => {
  const h = harness()
  for (let step = 1; step <= 100; step++) {
    h.begin(step)
    h.finish(usage, step)
  }
  assert.equal(h.view.items.length, MAX_USAGE_ITEMS)
  assert.equal(h.view.items[0].id, 'session-a:176')
  assert.ok(JSON.stringify(h.state).length < 5_000)
  assert.equal(h.projection.stateSchema.safeParse(h.state).success, true)
  assert.equal(h.projection.wire.viewSchema.safeParse(h.view).success, true)
})

test('restore preserves values and subsequent internal events preserve wire reference', () => {
  const h = harness()
  h.begin()
  h.finish()
  const serialized = JSON.stringify(h.view)
  h.restore()
  assert.equal(JSON.stringify(h.view), serialized)
  const before = h.view
  h.header('other', 'other')
  h.add('request/context', { provider: 'deepseek', model: 'deepseek-flash' })
  h.add('tool/result', {})
  assert.equal(h.view, before)
  h.finish()
  assert.equal(h.view, before)
})

test('fork prefixes inherit route only, and sessions cannot share or leak usage', () => {
  const parent = harness('parent')
  const child = harness('child', 3)
  for (const h of [parent, child]) {
    h.header()
    h.begin()
    h.finish()
  }
  assert.equal(parent.view.items.length, 1)
  assert.equal(child.view.items.length, 0)
  child.add('assistant/attempt', { turn: 1, step: 1, stream: [chunk(usage)] })
  assert.equal(child.view.items[0].provider, 'deepseek')
  assert.equal(child.view.items[0].startedAt, null)
  assert.equal(child.view.items[0].costCny, null)
  assert.ok(child.view.items[0].id.startsWith('child:'))
  assert.equal(parent.view.items.length, 1)
  const fresh = harness('fresh')
  assert.deepEqual(fresh.view, { items: [] })
  assert.notEqual(fresh.view, child.view)
})

test('weekends and verified holidays are off-peak at peak hours', () => {
  for (const date of ['2026-10-24T10:00:00+08:00', '2026-10-01T10:00:00+08:00']) {
    assert.equal(estimateCostCny('deepseek', 'deepseek-flash', usage, Date.parse(date)), 0.000304)
  }
})
