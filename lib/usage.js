import { z } from 'zod'
import { BUILTIN_POLICY, CALENDAR } from './policy.js'

export const MAX_USAGE_ITEMS = 12
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const timestamp = z.number().finite().min(-8.64e15).max(8.64e15)
const route = z.string().max(512).nullable()
const usageSchema = z.object({ inputTokens: count, outputTokens: count,
  cacheReadTokens: count.optional(), cacheWriteTokens: count.optional() }).strict()
const itemSchema = z.object({ id: z.string(), seq: count, at: timestamp,
  startedAt: timestamp.nullable(), provider: route, model: route,
  tokens: count.positive(), usage: usageSchema,
  costCny: z.number().finite().nonnegative().nullable() }).strict()
const viewSchema = z.object({ items: z.array(itemSchema).max(MAX_USAGE_ITEMS) }).strict()
const attemptSchema = z.object({ turn: count, step: count, id: z.string(),
  startedAt: timestamp.nullable() }).strict()
const stateSchema = z.object({ sessionId: z.string(), inheritedEventCount: count,
  highwater: z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER),
  provider: route, model: route, attempt: attemptSchema.nullable(), view: viewSchema }).strict()

// Immutable reference tariff snapshots: settings/refresh cannot rewrite history.
// These estimates are not provider invoices.
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
const policy = freeze(structuredClone(BUILTIN_POLICY))
const calendar = freeze(structuredClone(CALENDAR))
const validCount = value => Number.isSafeInteger(value) && value >= 0
const validTime = value => Number.isFinite(value) && Math.abs(value) <= 8.64e15
const routePart = value => typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : null

/** Validate the last sample as a whole; never fall back to earlier samples. */
export function normalizeUsage(sample) {
  if (!sample || !validCount(sample.inputTokens) || !validCount(sample.outputTokens)) return null
  for (const key of ['cacheReadTokens', 'cacheWriteTokens', 'totalTokens', 'reasoningTokens']) {
    if (sample[key] !== undefined && !validCount(sample[key])) return null
  }
  if (sample.reasoningTokens !== undefined && sample.reasoningTokens > sample.outputTokens) return null
  // Input is UNCACHED; cache buckets are disjoint. Output includes reasoning.
  const sum = sample.inputTokens + sample.outputTokens
    + (sample.cacheReadTokens ?? 0) + (sample.cacheWriteTokens ?? 0)
  if (!Number.isSafeInteger(sum) || sum <= 0) return null
  if (sample.totalTokens !== undefined && sample.totalTokens !== sum) return null
  const usage = { inputTokens: sample.inputTokens, outputTokens: sample.outputTokens }
  for (const key of ['cacheReadTokens', 'cacheWriteTokens']) {
    if (sample[key] !== undefined) usage[key] = sample[key]
  }
  return { tokens: sum, usage }
}

/** Reference CNY estimate at request start; unknown attribution stays unknown. */
export function estimateCostCny(provider, model, usage, startedAt) {
  if (provider !== 'deepseek' || !validTime(startedAt)) return null
  const key = model === 'deepseek-v4-flash' ? 'deepseek-flash' : model
  const prices = Object.hasOwn(policy.prices, key) ? policy.prices[key] : null
  if (!prices || !normalizeUsage(usage) || usage.cacheReadTokens === undefined
    || (usage.cacheWriteTokens ?? 0) !== 0) return null
  const china = new Date(startedAt + 8 * 3_600_000)
  if (!Number.isFinite(china.getTime())) return null
  const date = china.toISOString().slice(0, 10)
  // Never extrapolate the verified holiday calendar, including weekends.
  if (date < calendar.validFrom || date > calendar.validThrough) return null
  const weekend = policy.weekendAllValley && [0, 6].includes(china.getUTCDay())
  const holiday = policy.holidaysAllValley && calendar.holidays.some(([a, b]) => date >= a && date <= b)
  const hour = ((startedAt % 86_400_000 + 86_400_000) % 86_400_000) / 3_600_000
  const peak = !weekend && !holiday && policy.windows.some(([a, b]) => a < b
    ? hour >= a && hour < b : hour >= a || hour < b)
  const price = peak ? prices.peak : prices.offPeak
  const cost = (usage.inputTokens * price.cacheMiss + usage.cacheReadTokens * price.cacheHit
    + usage.outputTokens * price.output) / 1_000_000
  return Number.isFinite(cost) && cost >= 0 ? cost : null
}

function lastUsage(data, type) {
  if (type === 'assistant/message' && data.usage !== undefined) return data.usage
  if (!Array.isArray(data.stream)) return undefined
  for (let i = data.stream.length - 1; i >= 0; i--) {
    const record = data.stream[i]
    if (record?.type === 'chunk' && record.chunk?.type === 'usage') return record.chunk.usage
  }
  return undefined
}
function sameStep(attempt, data) {
  return attempt?.turn === data.turn && attempt.step === data.step
}
function olderStep(attempt, data) {
  return attempt && (data.turn < attempt.turn || (data.turn === attempt.turn && data.step < attempt.step))
}
function newAttempt(state, event, startedAt) {
  return { turn: event.data.turn, step: event.data.step,
    id: `${state.sessionId}:${event.seq}`, startedAt }
}
function sameItem(a, b) {
  return a && a.tokens === b.tokens && a.provider === b.provider && a.model === b.model
    && a.costCny === b.costCny && a.startedAt === b.startedAt
    && a.usage.inputTokens === b.usage.inputTokens && a.usage.outputTokens === b.usage.outputTokens
    && a.usage.cacheReadTokens === b.usage.cacheReadTokens && a.usage.cacheWriteTokens === b.usage.cacheWriteTokens
}

/** Bounded, JSON-checkpointable projection; no subscriptions or history scans. */
export function createUsageProjection() {
  return {
    key: 'peakValleyUsage', stateVersion: 1, stateSchema,
    init(header, inheritedEventCount = 0) {
      return { sessionId: String(header.id), inheritedEventCount, highwater: -1,
        provider: null, model: null, attempt: null, view: { items: [] } }
    },
    apply(state, event) {
      if (!validCount(event.seq) || event.seq <= state.highwater) return state
      const next = { ...state, highwater: event.seq }
      const data = event.data ?? {}
      if (event.type === 'request/header' || event.type === 'request/context') {
        const source = event.type === 'request/header' ? data.header?.config : data
        next.provider = routePart(source?.provider)
        next.model = routePart(source?.model)
        return next
      }
      // Inherited routes remain useful; inherited spending belongs to the parent.
      if (event.seq < state.inheritedEventCount) return next
      const settlement = event.type === 'assistant/message' || event.type === 'assistant/attempt'
      if (!settlement && event.type !== 'step/start' && event.type !== 'llm/retry-started') return next
      if (!validCount(data.turn) || !validCount(data.step) || olderStep(state.attempt, data)) return next
      const matches = sameStep(state.attempt, data)
      if (event.type === 'step/start') {
        if (!matches) next.attempt = newAttempt(state, event, validTime(event.time) ? event.time : null)
        return next
      }
      if (event.type === 'llm/retry-started') {
        next.attempt = newAttempt(state, event, validTime(event.time) ? event.time : null)
        return next
      }
      const attempt = matches ? state.attempt : newAttempt(state, event, null)
      next.attempt = attempt
      const sample = normalizeUsage(lastUsage(data, event.type))
      if (!sample || !validTime(event.time)) return next
      const source = data.message?.source
      const provider = source ? routePart(source.provider) : state.provider
      const model = source ? routePart(source.model) : state.model
      const previous = state.view.items.find(item => item.id === attempt.id)
      const startedAt = attempt.startedAt !== null && attempt.startedAt <= event.time ? attempt.startedAt : null
      const item = { id: attempt.id, seq: previous?.seq ?? event.seq, at: previous?.at ?? event.time,
        startedAt, provider, model, ...sample,
        costCny: estimateCostCny(provider, model, sample.usage, startedAt) }
      // Corrections retain the original completion identity so clients animate once.
      if (sameItem(previous, item)) return next
      const items = previous ? state.view.items.map(old => old.id === item.id ? item : old)
        : [...state.view.items, item].slice(-MAX_USAGE_ITEMS)
      next.view = { items }
      return next
    },
    wire: { viewSchema, view: state => state.view },
  }
}
