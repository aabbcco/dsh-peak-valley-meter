import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply, Config, PeakValleyController, buildStatus } from '../lib/index.js'
import { readConfig, resolveConfig, validatePatch } from '../lib/config.js'
import { NativeSettings, parseRevision } from '../lib/native-settings.js'
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

function native(config = {}, namespace = 'profile-owned-meter') {
  let raw = structuredClone(config)
  let revision = 0
  const calls = []
  const service = {
    writable: true,
    describe() { return [{ ns: namespace, revision, value: resolveConfig(raw) }] },
    async mutate(ns, ops, expectedRevision) {
      calls.push({ ns, ops, expectedRevision })
      assert.equal(ns, namespace)
      if (expectedRevision !== undefined && expectedRevision !== revision) throw new Error('settings namespace changed since it was read')
      const next = structuredClone(raw)
      for (const op of ops) {
        assert.equal(op.op, 'set')
        const [key, child] = op.path
        if (child === undefined) next[key] = op.value
        else next[key] = { ...next[key], [child]: op.value }
      }
      resolveConfig(next)
      raw = next
      revision++
    },
    get raw() { return structuredClone(raw) },
  }
  return { service, namespace, calls }
}
const options = (home, host) => ({ home, now, namespace: host.namespace, settings: host.service })

test('name updates persist through native service and retain unrelated settings', () => fixture(async home => {
  const host = native({ autoUpdate: false })
  const controller = new PeakValleyController({}, options(home, host))
  const before = controller.status()
  assert.deepEqual(before.labels, { peak: '梁文峰', valley: '梁文谷' })
  assert.equal(before.configNamespace, host.namespace)
  assert.equal(before.configVersion, '0')
  assert.equal(before.configWritable, true)
  const after = await controller.updateConfig({ peakLabel: '忙时', valleyLabel: '闲时' }, before.configVersion)
  assert.deepEqual(after.labels, { peak: '忙时', valley: '闲时' })
  assert.equal(after.position, before.position)
  assert.equal(after.peakPrice, before.peakPrice)
  assert.deepEqual(after.settings.reminders, before.settings.reminders)
  assert.equal(after.configVersion, '1')
  assert.equal(host.calls[0].expectedRevision, 0)
  assert.equal(existsSync(join(home, 'storages/dsh-peak-valley-price/config.json')), false)
  const reloaded = new PeakValleyController({}, options(home, host))
  assert.deepEqual(reloaded.status().settings, after.settings)
  assert.deepEqual(controller.settings().settings, after.settings)
  await controller.dispose(); await reloaded.dispose()
}))

test('all current settings stay independent and no custom price mode is inferred', () => fixture(async home => {
  const host = native({ autoUpdate: false, peakPrice: 9, valleyPrice: 4.5 })
  const controller = new PeakValleyController({}, options(home, host))
  const before = controller.status()
  assert.equal(before.priceSource, 'official')
  assert.equal(before.peakPrice, 8)
  const after = await controller.updateConfig({ showUsageFloat: false, usageFloatUnit: 'cny', priceMode: 'custom' })
  assert.equal(after.settings.showUsageFloat, false)
  assert.equal(after.settings.usageFloatUnit, 'cny')
  assert.equal(after.peakPrice, 9)
  assert.deepEqual(after.labels, before.labels)
  await assert.rejects(controller.updateConfig({ usageFloatUnit: 'usd' }))
  await controller.dispose()
}))

test('float color edits use native settings and preserve explicit follow choices', () => fixture(async home => {
  const host = native({ autoUpdate: false })
  const controller = new PeakValleyController({}, options(home, host))
  const before = controller.status()
  const after = await controller.updateConfig({ usageFloatColor: '#ff66aa', usageFloatDuration: 5.5 })
  assert.equal(after.settings.usageFloatFollowPeriod, false)
  assert.equal(after.settings.usageFloatColor, '#ff66aa')
  assert.equal(after.valleyColor, before.valleyColor)
  for (const patch of [{ usageFloatDuration: 0 }, { usageFloatDuration: 9 }, { usageFloatDuration: NaN }, { usageFloatColor: 'invalid' }]) await assert.rejects(controller.updateConfig(patch))
  const followed = await controller.updateConfig({ usageFloatColor: '#00ff00', usageFloatFollowPeriod: true })
  assert.equal(followed.settings.usageFloatFollowPeriod, true)
  await controller.updateConfig({ reminders: { beforePeak: true } })
  const reminded = await controller.updateConfig({ reminders: { onValley: true } })
  assert.equal(reminded.settings.reminders.beforePeak, true)
  assert.equal(reminded.settings.reminders.onValley, true)
  assert.equal(host.calls.at(-1).ops[0].path.join('.'), 'reminders.onValley')
  await controller.dispose()
}))

test('native write failures leave settings and revisions intact', () => fixture(async home => {
  const host = native({ autoUpdate: false })
  host.service.mutate = async () => { throw new Error('disk full') }
  const controller = new PeakValleyController({}, options(home, host))
  const before = controller.status()
  await assert.rejects(controller.updateConfig({ peakLabel: 'changed' }), /disk full/)
  assert.equal(controller.status().labels.peak, before.labels.peak)
  assert.equal(controller.status().configVersion, before.configVersion)
  await controller.dispose()
}))

test('native stale revisions reject without retrying and reads reflect the latest values', () => fixture(async home => {
  const host = native({ autoUpdate: false })
  const first = new PeakValleyController({}, options(home, host))
  const second = new PeakValleyController({}, options(home, host))
  const revision = second.settings().configVersion
  await first.updateConfig({ peakLabel: 'first' }, revision)
  await assert.rejects(second.updateConfig({ valleyLabel: 'second' }, revision), /changed since/)
  assert.equal(host.calls.length, 2)
  assert.equal(host.calls[1].expectedRevision, 0)
  assert.equal(second.status().labels.peak, 'first')
  assert.equal(second.status().labels.valley, '梁文谷')
  await first.dispose(); await second.dispose()
}))

test('revision grammar rejects old digests and unsafe input before writes', () => fixture(async home => {
  assert.equal(parseRevision(undefined), undefined)
  assert.equal(parseRevision('0'), 0)
  assert.equal(parseRevision(12), 12)
  for (const value of ['legacy-digest', '', ' 1', '01', '1.0', '-1', '1e3', null, NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => parseRevision(value))
  const host = native({ autoUpdate: false })
  const controller = new PeakValleyController({}, options(home, host))
  await assert.rejects(controller.updateConfig({ peakLabel: 'stale' }, 'bb09e444a2432acdb156'), /版本无效/)
  assert.equal(host.calls.length, 0)
  await controller.dispose()
}))

test('without settings service the live Config remains readable and writes are refused', () => fixture(async home => {
  const checked = Config['~standard'].validate({ autoUpdate: false, peakLabel: '引用峰' })
  assert.equal(checked.issues, undefined)
  const controller = new PeakValleyController(checked.value, { home, now, namespace: 'different-instance' })
  assert.equal(controller.status().labels.peak, '引用峰')
  assert.equal(controller.status().configWritable, false)
  assert.equal(controller.status().configVersion, null)
  await assert.rejects(controller.updateConfig({ peakLabel: 'changed' }), /暂时无法保存/)
  const host = native({ autoUpdate: false, peakLabel: '宿主峰' }, 'different-instance')
  const unbind = controller.nativeSettings.bind(host.service)
  assert.equal(controller.status().labels.peak, '宿主峰')
  assert.equal(controller.status().configWritable, true)
  unbind()
  assert.equal(controller.status().configWritable, false)
  const changed = Config['~standard'].validate({ autoUpdate: false, peakLabel: '后续峰' }).value
  Object.assign(checked.value, changed)
  assert.equal(controller.status().labels.peak, '后续峰')
  assert.equal(readConfig(checked.value).peakLabel, '后续峰')
  await controller.dispose()
}))

test('missing or read-only native descriptors never allow a fallback write', () => {
  const host = native()
  host.service.writable = false
  const adapter = new NativeSettings(host.namespace, host.service)
  assert.equal(adapter.snapshot({}).configWritable, false)
  return assert.rejects(adapter.update({ showClock: true }), /暂时无法保存/)
})

test('old configuration JSON is never read or overwritten', () => fixture(async home => {
  const path = join(home, 'storages/dsh-peak-valley-price/config.json')
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, '{broken')
  const host = native({ autoUpdate: false })
  const controller = new PeakValleyController({}, options(home, host))
  assert.equal(controller.status().configError, null)
  await controller.updateConfig({ showClock: true })
  assert.equal(controller.status().flags.showClock, true)
  assert.equal(readFileSync(path, 'utf8'), '{broken')
  await controller.dispose()
}))

test('official sync still persists its separate policy cache and retains valid data on failure', () => fixture(async home => {
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
  assert.equal(existsSync(join(home, 'storages/dsh-peak-valley-price/config.json')), false)
  await controller.dispose(); await reloaded.dispose()
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

test('API exposes only status/cache/report routes and tools use the native instance namespace', () => fixture(async home => {
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const cleanups = []
  const host = native({ autoUpdate: false }, 'second-meter-instance')
  try {
    const routes = new Map(), tools = new Map()
    const effect = fn => { cleanups.push(fn()) }
    apply({
      fiber: { entry: { options: { id: host.namespace } } },
      effect,
      tools: { register(definition) { tools.set(definition.name, definition) } },
      inject(names, callback) {
        if (names[0] === 'settings') return callback({ effect, settings: host.service })
        if (names[0] === 'sessionProjections') return callback({ sessionProjections: { register(definition) {
          assert.equal(definition.key, 'peakValleyUsage')
          assert.deepEqual(definition.wire.view(definition.init({ id: 'test-session' }, 0)), { items: [] })
        }, onChanged() {} } })
        if (names[0] === 'clientModules') return callback({ effect, clientModules: {
          rebuilt() { return 'test-rev' }, graph() { return { entries: [{ id: 'dsh-peak-valley-meter', inject: [], immediately: true }] } },
        } })
        assert.deepEqual(names, ['connection'])
        callback({ connection: { fetch: { register(route) { routes.set(route.path, route) } } } })
      },
    }, { autoUpdate: false })
    assert.equal(routes.size, 3)
    assert.equal(routes.has('/api/peak-valley-price/updateConfig'), false)
    const invoke = async (endpoint, payload) => {
      const route = routes.get(`/api/peak-valley-price/${endpoint}`)
      return route.fetch(new Request(`http://localhost${route.path}`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'test-123', method: `peak-valley-price/${endpoint}`, payload }) }))
    }
    const envelope = await (await invoke('status', null)).json()
    assert.equal(envelope.type, 'server-response'); assert.equal(envelope.rpcId, 'test-123')
    assert.equal(envelope.result.value.version, '0.3.1')
    assert.equal(envelope.result.value.configNamespace, host.namespace)
    const manage = tools.get('peak_valley_settings')
    const toolResult = await manage.execute({ action: 'update', patch: { peakLabel: '测试峰', position: 'input-left' }, expectedRevision: '0' }, { signal: new AbortController().signal })
    const rpcResult = await (await invoke('status', null)).json()
    assert.equal(rpcResult.result.value.configVersion, toolResult.configVersion)
    assert.equal(rpcResult.result.value.labels.peak, '测试峰')
    const get = await manage.execute({ action: 'get' }, {})
    assert.deepEqual(get.settings, toolResult.settings)
    await assert.rejects(manage.execute({ action: 'update', patch: { peakPrice: -1 } }, {}))
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
