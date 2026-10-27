import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, realpathSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply, PeakValleyController, buildStatus } from '../lib/index.js'
import { resolveConfig, validatePatch } from '../lib/config.js'
import { officialFetcher } from './pricing-fixture.js'

const pluginDir = realpathSync(fileURLToPath(new URL('..', import.meta.url)))
const now = () => Date.parse('2026-10-22T10:00:00+08:00')
async function fixture(callback) {
  const home = mkdtempSync(join(pluginDir, '.rpc-test-'))
  try { await callback(home) }
  finally {
    const resolved = realpathSync(home)
    assert.equal(dirname(resolved), pluginDir)
    assert.ok(resolved.startsWith(join(pluginDir, '.rpc-test-')))
    rmSync(resolved, { recursive: true })
  }
}

test('name defaults stay unchanged and a name-only update preserves other settings', () => fixture(async (home) => {
  const controller = new PeakValleyController({ autoUpdate: false }, { home, now })
  assert.deepEqual(controller.status().labels, { peak: '梁文峰', valley: '梁文谷' })
  const before = controller.status()
  const after = controller.updateConfig({ peakLabel: '忙时', valleyLabel: '闲时' })
  assert.deepEqual(after.labels, { peak: '忙时', valley: '闲时' })
  assert.equal(after.position, before.position)
  assert.equal(after.peakPrice, before.peakPrice)
  assert.deepEqual(after.settings.reminders, before.settings.reminders)
  await controller.dispose()
}))

test('usage floating settings preserve labels and prices and validate units', () => fixture(async (home) => {
  const controller = new PeakValleyController({ autoUpdate: false, peakPrice: 9, valleyPrice: 4.5 }, { home, now })
  const before = controller.status()
  assert.equal(before.settings.showUsageFloat, true)
  assert.equal(before.settings.usageFloatUnit, 'tokens')
  const after = controller.updateConfig({ showUsageFloat: false, usageFloatUnit: 'cny' })
  assert.equal(after.settings.showUsageFloat, false)
  assert.equal(after.settings.usageFloatUnit, 'cny')
  assert.deepEqual(after.labels, before.labels)
  assert.equal(after.peakPrice, 9)
  assert.throws(() => controller.updateConfig({ usageFloatUnit: 'usd' }))
  await controller.dispose()
}))

test('float appearance saves independently and rejects invalid colors or durations', () => fixture(async (home) => {
  const controller = new PeakValleyController({ autoUpdate: false }, { home, now })
  const before = controller.status()
  assert.equal(before.settings.usageFloatDuration, 3)
  assert.equal(before.settings.usageFloatFollowPeriod, true)
  const after = controller.updateConfig({ usageFloatColor: '#ff66aa', usageFloatDuration: 5.5 })
  assert.equal(after.settings.usageFloatFollowPeriod, false)
  assert.equal(after.settings.usageFloatColor, '#ff66aa')
  assert.equal(after.valleyColor, before.valleyColor)
  assert.deepEqual(after.labels, before.labels)
  for (const patch of [{ usageFloatDuration: 0 }, { usageFloatDuration: 9 }, { usageFloatDuration: NaN }, { usageFloatColor: 'invalid' }]) assert.throws(() => controller.updateConfig(patch))
  const reloaded = new PeakValleyController({ autoUpdate: false }, { home, now })
  assert.equal(reloaded.status().settings.usageFloatDuration, 5.5)
  assert.equal(reloaded.status().settings.usageFloatColor, '#ff66aa')
  assert.equal(controller.updateConfig({ usageFloatColor: '#00ff00', usageFloatFollowPeriod: true }).settings.usageFloatFollowPeriod, true)
  await controller.dispose(); await reloaded.dispose()
}))

test('legacy custom prices and appearance survive unrelated edits and reload', () => fixture(async (home) => {
  const path = join(home, 'storages/dsh-peak-valley-price/config.json')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ peakLabel: '梁文峰', valleyLabel: '梁文谷', peakPrice: 9, valleyPrice: 4.5, position: 'input-left', showPrice: false, autoUpdate: false }))
  const controller = new PeakValleyController({}, { home, now })
  const before = controller.status()
  assert.equal(before.priceSource, 'custom')
  assert.equal(before.peakPrice, 9)
  assert.equal(before.prices['deepseek-flash'].peak.output, 8)
  const after = controller.updateConfig({ showClock: true, _revision: before.configVersion })
  assert.equal(after.labels.peak, '梁文峰')
  assert.equal(after.flags.showPrice, false)
  assert.equal(after.position, 'input-left')
  assert.equal(after.settings.priceMode, 'custom')
  const reloaded = new PeakValleyController({}, { home, now })
  assert.equal(reloaded.status().peakPrice, 9)
  assert.equal(reloaded.status().flags.showClock, true)
  const official = reloaded.updateConfig({ priceMode: 'official' })
  assert.equal(official.peakPrice, 8)
  assert.equal(official.settings.peakPrice, 9) // can switch back without losing custom values
  await controller.dispose(); await reloaded.dispose()
}))

test('legacy formats, partial prices and nested reminders survive migration', () => fixture(async (home) => {
  const warnings = []
  const loaded = resolveConfig({}, { peakPrice: '12', peakColor: 'red', position: 'dock', timezone: 'invalid/zone' }, warnings)
  assert.equal(loaded.peakPrice, 12)
  assert.equal(loaded.valleyPrice, 4.5)
  assert.equal(loaded.peakColor, 'red')
  assert.equal(loaded.position, 'dock')
  assert.equal(warnings.length, 1)
  assert.equal(resolveConfig({}, { valleyPrice: 3 }).peakPrice, 9)
  assert.deepEqual(resolveConfig({ reminders: { beforePeak: true } }, { reminders: { onValley: true } }).reminders,
    { beforeMinutes: 10, beforePeak: true, beforeValley: false, onPeak: false, onValley: true })
  const controller = new PeakValleyController({ peakPrice: 12, autoUpdate: false }, { home, now })
  assert.equal(controller.updateConfig({ showClock: true }).valleyPrice, 4.5)
  const reloaded = new PeakValleyController({ peakPrice: 12, autoUpdate: false }, { home, now })
  assert.equal(reloaded.status().valleyPrice, 4.5)
  await controller.dispose(); await reloaded.dispose()
}))

test('failed writes and invalid patches never mutate in-memory settings', () => fixture(async (home) => {
  const controller = new PeakValleyController({ autoUpdate: false }, { home, now, write() { throw new Error('disk full') } })
  const before = controller.status()
  assert.throws(() => controller.updateConfig({ peakLabel: 'changed' }), /保存失败/)
  assert.equal(controller.status().labels.peak, before.labels.peak)
  assert.equal(controller.status().configVersion, before.configVersion)
  for (const patch of [{ timezone: 'bad/zone' }, { peakPrice: -1 }, { peakColor: 'url(evil)' }, { unknown: 1 }, { reminders: { beforeMinutes: 0 } }, { showClock: 'true' }]) {
    assert.throws(() => validatePatch(patch))
  }
  await controller.dispose()
}))

test('stale config revisions reject concurrent writers and load latest settings', () => fixture(async (home) => {
  const first = new PeakValleyController({ autoUpdate: false }, { home, now })
  const second = new PeakValleyController({ autoUpdate: false }, { home, now })
  const version = second.status().configVersion
  first.updateConfig({ peakLabel: 'first' })
  assert.throws(() => second.updateConfig({ valleyLabel: 'second', _revision: version }), /其他窗口/)
  assert.equal(second.status().labels.peak, 'first')
  assert.equal(JSON.parse(readFileSync(first.configFile, 'utf8')).peakLabel, 'first')
  await first.dispose(); await second.dispose()
}))

test('official sync persists valid policy and retains it on later failures', () => fixture(async (home) => {
  const controller = new PeakValleyController({ autoUpdate: false }, { home, now, fetcher: officialFetcher })
  const fresh = await controller.refreshPolicy()
  assert.equal(fresh.policy.source, 'official')
  assert.equal(fresh.policy.lastError, null)
  const reloaded = new PeakValleyController({ autoUpdate: false }, { home, now })
  assert.equal(reloaded.status().policy.source, 'cached')
  controller.fetcher = async () => { throw new Error('offline') }
  const failed = await controller.refreshPolicy()
  assert.match(failed.policy.lastError, /offline/)
  assert.equal(failed.policy.version, fresh.policy.version)
  assert.equal(failed.policy.lastSuccessAt, fresh.policy.lastSuccessAt)
  assert.equal(failed.peakPrice, fresh.peakPrice)
  await controller.dispose(); await reloaded.dispose()
}))

test('damaged saved configuration is not silently overwritten', () => fixture(async (home) => {
  const path = join(home, 'storages/dsh-peak-valley-price/config.json')
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, '{broken')
  const controller = new PeakValleyController({ autoUpdate: false }, { home, now })
  assert.match(controller.status().policy.warning, /无法读取/)
  assert.throws(() => controller.updateConfig({ showClock: true }), /本次未写入/)
  assert.equal(readFileSync(path, 'utf8'), '{broken')
  await controller.dispose()
}))

test('status uses official dates and reports unknown calendar without fictitious prices', () => {
  const config = resolveConfig()
  const holiday = buildStatus(config, Date.parse('2026-10-01T10:00:00+08:00'))
  assert.equal(holiday.current.period, 'off-peak')
  assert.equal(holiday.current.price, 4)
  assert.equal(holiday.nextSwitch.date, '2026-10-08')
  const expired = buildStatus(config, Date.parse('2027-01-04T10:00:00+08:00'))
  assert.equal(expired.current.period, 'unknown')
  assert.equal(expired.current.price, null)
  assert.ok(expired.policy.warning)
})

test('shared API and tools call the same controller and validate RPC envelopes', () => fixture(async (home) => {
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const cleanups = []
  try {
    const routes = new Map(), tools = new Map()
    apply({
      effect(fn) { cleanups.push(fn()) },
      tools: { register(definition) { tools.set(definition.name, definition) } },
      inject(names, callback) {
        if (names[0] === 'sessionProjections') {
          callback({ sessionProjections: { register(definition) {
            assert.equal(definition.key, 'peakValleyUsage')
            assert.deepEqual(definition.wire.view(definition.init({ id: 'test-session' }, 0)), { items: [] })
          }, onChanged() {} } })
          return
        }
        if (names[0] === 'clientModules') {
          callback({ effect(fn) { cleanups.push(fn()) }, clientModules: {
            rebuilt(id) { assert.equal(id, 'dsh-peak-valley-meter'); return 'test-rev' },
            graph() { return { entries: [{ id: 'dsh-peak-valley-meter', inject: [], immediately: true }] } },
          } })
          return
        }
        assert.deepEqual(names, ['connection'])
        callback({ connection: { fetch: { register(route) { routes.set(route.path, route) } } } })
      },
    }, { autoUpdate: false })
    assert.equal(routes.size, 4)
    const invoke = (endpoint, payload) => {
      const route = routes.get(`/api/peak-valley-price/${endpoint}`)
      assert.deepEqual(route.methods, ['POST'])
      return route.fetch(new Request(`http://localhost${route.path}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'test-123', method: `peak-valley-price/${endpoint}`, payload }),
      }))
    }
    const envelope = await (await invoke('status', null)).json()
    assert.equal(envelope.type, 'server-response'); assert.equal(envelope.rpcId, 'test-123')
    assert.equal(envelope.result.value.version, '0.3.0')
    const manage = tools.get('peak_valley_settings')
    const args = { action: 'update', patch: { peakLabel: '测试峰', position: 'input-left' } }
    const toolResult = await manage.execute(args, { signal: new AbortController().signal })
    const rpcResult = await (await invoke('status', null)).json()
    assert.equal(rpcResult.result.value.configVersion, toolResult.configVersion)
    assert.equal(rpcResult.result.value.labels.peak, '测试峰')
    const rejected = await (await invoke('updateConfig', { peakPrice: -1 })).json()
    assert.equal(rejected.result.ok, false)
    assert.match(rejected.result.error.message, /价格/)
    const route = routes.get('/api/peak-valley-price/status')
    for (const body of ['not-json', '{}', JSON.stringify({ type: 'client-request', rpcId: 'x', method: 'wrong/status', payload: null })]) {
      assert.equal((await route.fetch(new Request(`http://localhost${route.path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body }))).status, 400)
    }
    assert.equal((await route.fetch(new Request(`http://localhost${route.path}`, { method: 'POST', body: '{}' }))).status, 415)
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup()
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
}))
