import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { boot, loadProfileDirectory, readProfilePatches } from '@deepseek-ai/dsh-app-boot'
import { readConfig } from '../lib/config.js'

const project = fileURLToPath(new URL('../', import.meta.url))
const installAnchor = join(project, 'package.json')

async function fixture(run, { realPlugin = false } = {}) {
  const temporary = await mkdtemp(join(project, '.native-settings-test-'))
  const dir = join(temporary, 'profile')
  const home = join(temporary, 'home')
  const bundle = join(dir, 'node_modules', 'native-meter-fixture')
  let ctx
  try {
    await mkdir(bundle, { recursive: true })
    await mkdir(home)
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'native-test-profile', private: true, type: 'module',
      dependencies: { 'native-meter-fixture': 'file:node_modules/native-meter-fixture' },
      dsh: { profile: { bundles: ['native-meter-fixture'] } } }))
    await writeFile(join(dir, 'cordis.yml'), '[]\n')
    await writeFile(join(dir, 'cordis.patch.yml'), '[]\n')
    await writeFile(join(bundle, 'package.json'), JSON.stringify({ name: 'native-meter-fixture', version: '1.0.0', type: 'module',
      main: './index.js', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
    const entry = pathToFileURL(join(project, realPlugin ? 'lib/index.js' : 'lib/config.js')).href
    await writeFile(join(bundle, 'index.js'), realPlugin
      ? `export { Config, apply, inject } from ${JSON.stringify(entry)};\n`
      : `export { Config } from ${JSON.stringify(entry)};\nexport function apply() {}\n`)
    const rows = [
      { id: 'config-editor', name: '@deepseek-ai/dsh-config-editor' },
      { id: 'settings', name: '@deepseek-ai/dsh-settings' },
      { id: 'meter-one', name: 'native-meter-fixture', config: { autoUpdate: false } },
      { id: 'meter-two', name: 'native-meter-fixture', config: { autoUpdate: false, peakLabel: '第二实例' } },
    ]
    await writeFile(join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: rows }]))
    const profileContext = { dir, home, name: 'native-test-profile', installAnchor, patchPath: join(dir, 'cordis.patch.yml'), overlays: [], telemetryDisabledEnv: undefined }
    const tools = []
    const start = async () => {
      tools.length = 0
      const profile = loadProfileDirectory('native-test', dir, installAnchor)
      ctx = await boot('native-test', join(dir, 'cordis.yml'), readProfilePatches('native-test', profileContext, profile), host => {
        host.provide('profileContext', profileContext)
        if (realPlugin) host.provide('tools', { register(definition) { tools.push(definition) } })
      })
      return ctx
    }
    await start()
    await run({ get ctx() { return ctx }, start, tools, dir, home, patchPath: profileContext.patchPath })
  } finally {
    await ctx?.fiber.dispose()
    const absolute = await realpath(temporary)
    assert.equal(dirname(absolute), await realpath(project))
    assert.ok(absolute.startsWith(join(await realpath(project), '.native-settings-test-')))
    await rm(absolute, { recursive: true })
  }
}

const row = (ctx, id) => [...ctx.loader.entries()].find(entry => entry.options.id === id)
const descriptor = (ctx, id) => ctx.settings.describe({ redactSecrets: true }).find(item => item.ns === id)

test('real SettingsForms and ConfigEditor persist volatile edits, reject invalid/stale writes and isolate instances', () => fixture(async host => {
  const first = row(host.ctx, 'meter-one')
  const second = row(host.ctx, 'meter-two')
  assert.equal(first.fiber.state, 2)
  assert.equal(second.fiber.state, 2)
  const identity = first.fiber
  const current = descriptor(host.ctx, 'meter-one')
  assert.ok(current)
  assert.equal(current.applies, 'live')
  assert.equal(current.value.peakLabel, '梁文峰')
  await host.ctx.settings.mutate('meter-one', [
    { op: 'set', path: ['peakLabel'], value: '原生峰' },
    { op: 'set', path: ['usageFloatDuration'], value: 5.5 },
    { op: 'set', path: ['reminders', 'onPeak'], value: true },
  ], current.revision)
  assert.equal(row(host.ctx, 'meter-one').fiber, identity)
  assert.equal(readConfig(identity.config).peakLabel, '原生峰')
  assert.equal(readConfig(identity.config).usageFloatDuration, 5.5)
  assert.equal(readConfig(identity.config).reminders.onPeak, true)
  assert.equal(readConfig(second.fiber.config).peakLabel, '第二实例')
  const persisted = await readFile(host.patchPath, 'utf8')
  assert.match(persisted, /原生峰/)
  assert.match(persisted, /usageFloatDuration: 5.5/)
  for (const [key, value] of [['timezone', 'Invalid/Timezone'], ['peakWindows', [[1.001, 2]]], ['peakPrice', -1]]) {
    const revision = descriptor(host.ctx, 'meter-one').revision
    await assert.rejects(host.ctx.settings.mutate('meter-one', [{ op: 'set', path: [key], value }], revision))
    assert.equal(await readFile(host.patchPath, 'utf8'), persisted)
    assert.equal(readConfig(identity.config).peakLabel, '原生峰')
    assert.equal(row(host.ctx, 'meter-one').fiber, identity)
  }
  await assert.rejects(host.ctx.settings.mutate('meter-one', [{ op: 'set', path: ['valleyLabel'], value: '过期' }], current.revision))
  assert.equal(await readFile(host.patchPath, 'utf8'), persisted)
  await host.ctx.fiber.dispose()
  await host.start()
  const restored = descriptor(host.ctx, 'meter-one')
  assert.equal(restored.value.peakLabel, '原生峰')
  assert.equal(restored.value.usageFloatDuration, 5.5)
  assert.equal(restored.value.reminders.onPeak, true)
  assert.equal(descriptor(host.ctx, 'meter-two').value.peakLabel, '第二实例')
}))

test('real plugin entry binds native settings and tool edits share live values with native UI writes', () => fixture(async host => {
  const entries = [...host.ctx.loader.entries()].filter(entry => ['meter-one', 'meter-two'].includes(entry.options.id))
  assert.equal(entries.length, 2)
  assert.ok(entries.every(entry => entry.fiber.state === 2))
  const manage = host.tools.filter(tool => tool.name === 'peak_valley_settings')
  assert.equal(manage.length, 2)
  const byNamespace = new Map()
  for (const tool of manage) {
    const value = await tool.execute({ action: 'get' }, {})
    byNamespace.set(value.configNamespace, tool)
    assert.equal(value.configWritable, true)
    assert.equal(value.configVersion, String(descriptor(host.ctx, value.configNamespace).revision))
    assert.ok(value.schema)
  }
  const first = row(host.ctx, 'meter-one').fiber
  const original = descriptor(host.ctx, 'meter-one')
  const changed = await byNamespace.get('meter-one').execute({ action: 'update', patch: { peakLabel: '工具保存', usageFloatColor: '#ff33aa' }, expectedRevision: String(original.revision) }, {})
  assert.equal(changed.labels.peak, '工具保存')
  assert.equal(changed.settings.usageFloatFollowPeriod, false)
  assert.equal(descriptor(host.ctx, 'meter-one').value.peakLabel, '工具保存')
  assert.equal(row(host.ctx, 'meter-one').fiber, first)
  await host.ctx.settings.mutate('meter-one', [{ op: 'set', path: ['valleyLabel'], value: '界面保存' }], descriptor(host.ctx, 'meter-one').revision)
  const read = await byNamespace.get('meter-one').execute({ action: 'get' }, {})
  assert.equal(read.settings.valleyLabel, '界面保存')
  assert.equal(read.configVersion, String(descriptor(host.ctx, 'meter-one').revision))
  assert.equal((await byNamespace.get('meter-two').execute({ action: 'get' }, {})).settings.peakLabel, '第二实例')
  await assert.rejects(byNamespace.get('meter-one').execute({ action: 'update', patch: { peakLabel: '错误覆盖' }, expectedRevision: 'old-summary-hash' }, {}), /版本无效/)
  assert.equal(descriptor(host.ctx, 'meter-one').value.peakLabel, '工具保存')
}, { realPlugin: true }))
