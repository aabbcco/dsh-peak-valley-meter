// Peak/valley plugin Host: one controller shared by the UI RPCs and agent tools.
import { readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { BUILTIN_POLICY, evaluateSchedule, normalizeWindows } from './policy.js'
import { Config, CONFIG_FIELDS } from './config.js'
import { NativeSettings } from './native-settings.js'
import { fetchOfficialPolicy, OFFICIAL_URLS } from './official.js'
import { createUsageProjection } from './usage.js'

export { Config, resolveConfig } from './config.js'
export const name = 'dsh-peak-valley-meter'
// Official reference data remains a plugin-owned cache, separate from Config.
const STORAGE_NAME = 'dsh-peak-valley-price'
export const inject = ['tools']
const VERSION = '0.3.1'
const REFRESH_MS = 6 * 60 * 60 * 1000
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

function readPolicyCache(path) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'))
    if (!record(value)) throw new Error('文件内容不是配置对象')
    return { value, error: null }
  } catch (error) {
    if (error.code === 'ENOENT') return { value: {}, error: null }
    return { value: {}, error: `无法读取插件配置：${error.message}` }
  }
}

export function atomicWrite(path, value) {
  const target = resolve(path)
  const temp = join(dirname(target), `.${target.split(/[\\/]/).at(-1)}.${randomUUID()}.tmp`)
  mkdirSync(dirname(target), { recursive: true })
  try {
    writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    // Both paths are owned files in this plugin's storage directory.
    if (dirname(temp) !== dirname(target)) throw new Error('临时配置路径不匹配')
    renameSync(temp, target)
  } finally {
    try { unlinkSync(temp) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}

function validatePolicy(value) {
  if (!record(value) || typeof value.version !== 'string' || !Number.isFinite(Date.parse(value.verifiedAt))) throw new Error('规则缓存无效')
  normalizeWindows(value.windows)
  if (value.weekendAllValley !== true || value.holidaysAllValley !== true) throw new Error('规则缓存缺少周末或节假日规则')
  for (const model of ['deepseek-flash', 'deepseek-v4-pro']) for (const kind of ['cacheHit', 'cacheMiss', 'output']) {
    const peak = value.prices?.[model]?.peak?.[kind], valley = value.prices?.[model]?.offPeak?.[kind]
    if (![peak, valley].every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 10000)
      || Math.abs(peak - valley * 2) > 1e-9) throw new Error('规则缓存价格无效')
  }
  return { ...value, sourceUrl: OFFICIAL_URLS.zh }
}

export function buildStatus(config, atMs = Date.now(), official = BUILTIN_POLICY, metadata = {}) {
  const policy = config.ruleMode === 'custom'
    ? { ...official, windows: normalizeWindows(config.peakWindows), weekendAllValley: config.weekendAllValley, holidaysAllValley: config.holidaysAllValley }
    : official
  const schedule = evaluateSchedule(policy, config.timezone, atMs)
  const rates = official.prices[config.model]
  const custom = config.priceMode === 'custom'
  const peakPrice = custom ? config.peakPrice : rates.peak[config.priceKind]
  const valleyPrice = custom ? config.valleyPrice : rates.offPeak[config.priceKind]
  const currency = custom ? config.currency : '¥'
  const priceUnit = custom ? config.priceUnit : '/1M tokens'
  const labelFor = (period) => period === 'peak' ? config.peakLabel : period === 'off-peak' ? config.valleyLabel : '规则待更新'
  const price = schedule.current.period === 'unknown' ? null : schedule.current.period === 'peak' ? peakPrice : valleyPrice
  const warnings = [schedule.calendar.warning, metadata.configError, metadata.cacheError].filter(Boolean)
  return {
    version: VERSION, serverNow: atMs, configVersion: metadata.configVersion ?? null,
    configNamespace: metadata.configNamespace ?? null, configWritable: metadata.configWritable === true,
    configError: metadata.configError ?? null,
    now: schedule.now, timezone: schedule.timezone, date: schedule.date,
    billingDate: schedule.billingDate, billingTimezone: 'Asia/Shanghai',
    labels: { peak: config.peakLabel, valley: config.valleyLabel },
    windows: policy.windows, currency, priceUnit, peakPrice, valleyPrice,
    peakColor: config.peakColor, valleyColor: config.valleyColor, position: config.position,
    flags: { showCountdown: config.showCountdown, showPrice: config.showPrice, showBar: config.showBar, showClock: config.showClock },
    current: { ...schedule.current, label: labelFor(schedule.current.period), price, priceLabel: price === null ? '—' : `${currency}${price}${priceUnit}` },
    nextSwitch: schedule.nextSwitch ? { ...schedule.nextSwitch, label: labelFor(schedule.nextSwitch.period) } : null,
    segments: schedule.segments, dayStart: schedule.dayStart, dayEnd: schedule.dayEnd,
    settings: structuredClone(config), priceSource: custom ? 'custom' : 'official', priceModel: config.model, priceKind: config.priceKind,
    prices: structuredClone(official.prices),
    policy: { version: official.version, source: metadata.source ?? 'builtin', sourceUrl: OFFICIAL_URLS.zh,
      verifiedAt: official.verifiedAt, checkedAt: metadata.checkedAt ?? null, lastSuccessAt: metadata.lastSuccessAt ?? null,
      lastError: metadata.lastError ?? null, calendarValidThrough: schedule.calendar.validThrough,
      calendarSourceUrl: schedule.calendar.sourceUrl, calendarKnown: schedule.calendar.known,
      ruleMode: config.ruleMode, warning: warnings.join('；') || null },
  }
}

export class PeakValleyController {
  constructor(config = {}, options = {}) {
    const home = options.home ?? process.env.DSH_HOME?.trim() ?? join(homedir(), '.dsh')
    this.cacheFile = join(home || join(homedir(), '.dsh'), 'storages', STORAGE_NAME, 'official-policy.json')
    this.liveConfig = config
    this.nativeSettings = new NativeSettings(options.namespace, options.settings)
    this.write = options.write ?? atomicWrite
    this.fetcher = options.fetcher ?? globalThis.fetch
    this.clock = options.now ?? Date.now
    this.lifetime = new AbortController()
    this.disposed = false
    this.clientStatus = { state: 'unseen' }
    this.pending = null
    this.official = structuredClone(BUILTIN_POLICY)
    this.meta = { source: 'builtin', checkedAt: null, lastSuccessAt: null, lastError: null, cacheError: null }
    const cache = readPolicyCache(this.cacheFile)
    if (cache.error) this.meta.cacheError = '官方规则缓存损坏，正在使用内置参考规则'
    if (cache.value.policy) {
      try {
        const policy = validatePolicy(cache.value.policy)
        if (Date.parse(policy.verifiedAt) >= Date.parse(BUILTIN_POLICY.verifiedAt)) {
          this.official = policy
          this.meta = { ...this.meta, source: 'cached', checkedAt: cache.value.checkedAt ?? null, lastSuccessAt: policy.verifiedAt }
        }
      } catch { this.meta.cacheError = '官方规则缓存无效，正在使用内置参考规则' }
    }
  }
  status() {
    const snapshot = this.nativeSettings.snapshot(this.liveConfig)
    return { ...buildStatus(snapshot.settings, this.clock(), this.official, { ...this.meta, ...snapshot }), clientStatus: this.clientStatus, clientArtifact: this.clientArtifact ?? null, usageProjection: this.usageProjection ?? { registered: false } }
  }
  reportClient(payload) {
    if (!record(payload) || !['loaded', 'error'].includes(payload.state)) throw new Error('无效的插件加载诊断')
    this.clientStatus = { state: payload.state, revision: String(payload.revision ?? '').slice(0, 80), message: String(payload.message ?? '').slice(0, 500), receivedAt: new Date(this.clock()).toISOString() }
    return { accepted: true }
  }
  settings() { return { ...this.nativeSettings.snapshot(this.liveConfig), fields: CONFIG_FIELDS, schema: Config.toJSON() } }
  async updateConfig(input, expectedRevision) {
    if (this.disposed) throw new Error('插件已卸载')
    await this.nativeSettings.update(input, expectedRevision)
    if (this.disposed) throw new Error('插件已卸载')
    return this.status()
  }
  refreshPolicy(signal) {
    if (this.disposed) return Promise.reject(new Error('插件已卸载'))
    if (this.pending) return this.pending
    const controller = new AbortController()
    const abort = () => controller.abort(signal?.reason ?? this.lifetime.signal.reason)
    if (signal?.aborted || this.lifetime.signal.aborted) abort()
    signal?.addEventListener('abort', abort, { once: true })
    this.lifetime.signal.addEventListener('abort', abort, { once: true })
    this.pending = (async () => {
      const checkedAt = new Date(this.clock()).toISOString()
      try {
        const policy = await fetchOfficialPolicy({ fetcher: this.fetcher, signal: controller.signal, now: this.clock() })
        if (this.disposed || controller.signal.aborted) throw new Error('同步已取消')
        this.write(this.cacheFile, { policy, checkedAt })
        this.official = policy
        this.meta = { source: 'official', checkedAt, lastSuccessAt: policy.verifiedAt, lastError: null, cacheError: null }
      } catch (error) {
        if (!this.disposed) this.meta = { ...this.meta, checkedAt, lastError: `同步未应用，保留上次有效规则：${error.message}` }
      }
      return this.status()
    })().finally(() => {
      signal?.removeEventListener('abort', abort)
      this.lifetime.signal.removeEventListener('abort', abort)
      this.pending = null
    })
    return this.pending
  }
  maybeRefresh() {
    if (this.disposed || !this.nativeSettings.snapshot(this.liveConfig).settings.autoUpdate) return
    const checked = Date.parse(this.meta.checkedAt)
    if (!Number.isFinite(checked) || this.clock() - checked >= REFRESH_MS) void this.refreshPolicy().catch(() => {})
  }
  async dispose() { this.disposed = true; this.lifetime.abort(); await this.pending }
}

const output = { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] }

export function apply(ctx, config = {}) {
  const controller = new PeakValleyController(config, { namespace: ctx.fiber?.entry?.options?.id })
  ctx.inject(['settings'], (scoped) => {
    scoped.effect(() => controller.nativeSettings.bind(scoped.settings))
    if (typeof scoped.settings.configure === 'function') scoped.effect(() => scoped.settings.configure({ auto: false }, ctx.fiber))
  })
  ctx.effect(() => {
    const timer = setInterval(() => controller.maybeRefresh(), 60_000)
    const initial = setTimeout(() => controller.maybeRefresh(), 0)
    timer.unref?.(); initial.unref?.()
    return async () => { clearInterval(timer); clearTimeout(initial); await controller.dispose() }
  })
  ctx.inject(['sessionProjections'], (scoped) => {
    scoped.sessionProjections.register(createUsageProjection())
    controller.usageProjection = { registered: true, lastSeq: null, lastTokens: null }
    scoped.sessionProjections.onChanged((_session, key, value, seq) => {
      if (key !== 'peakValleyUsage') return
      controller.usageProjection = { registered: true, lastSeq: seq, lastTokens: value.items.at(-1)?.tokens ?? null }
    })
  })
  ctx.inject(['clientModules'], (scoped) => {
    scoped.effect(() => {
      // A linked plain-JS plugin has no build watcher. Publish only our own
      // completed Client artifact when this Host generation activates.
      const timer = setTimeout(() => {
        const modules = scoped.clientModules
        const rev = modules.rebuilt(name)
        const entry = modules.graph().entries.find((item) => item.id === name)
        controller.clientArtifact = { rev: rev ?? null, inject: entry?.inject ?? [], immediately: entry?.immediately ?? false }
      }, 0)
      timer.unref?.()
      return () => clearTimeout(timer)
    })
  })
  ctx.inject(['connection'], (scoped) => {
    for (const endpoint of ['status', 'refreshPolicy', 'clientReport']) {
      const method = `peak-valley-price/${endpoint}`
      scoped.connection.fetch.register({
        path: `/api/${method}`, methods: ['POST'], requestBody: 'buffered',
        async fetch(request) {
          if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return new Response('content type must be application/json', { status: 415 })
          let message
          try { message = await request.json() } catch { return new Response('body is not JSON', { status: 400 }) }
          if (!record(message) || message.type !== 'client-request' || typeof message.rpcId !== 'string' || message.method !== method || !Object.hasOwn(message, 'payload')) return new Response('invalid client-request message', { status: 400 })
          let result
          try {
            const value = endpoint === 'status' ? controller.status()
              : endpoint === 'clientReport' ? controller.reportClient(message.payload)
              : await controller.refreshPolicy(request.signal)
            result = { ok: true, value }
          } catch (error) { result = { ok: false, error: { code: 'peak-valley-price/operation-failed', message: error.message, details: {} } } }
          return Response.json({ type: 'server-response', rpcId: message.rpcId, result })
        },
      })
    }
  })
  ctx.tools.register(defineTool({
    name: 'peak_valley_price',
    description: '查询峰谷状态、下次切换、当地时间轴和参考价格。计费日期按北京时间，包含周末及已验证节假日；返回规则来源、更新时间和未覆盖日历提示。',
    parameters: {}, output, execute: async () => controller.status(), timeoutMs: 2000, isConcurrencySafe: () => true,
  }))
  ctx.tools.register(defineTool({
    name: 'peak_valley_settings', deferLoading: true,
    description: '查看或修改峰谷插件设置，或从官方定价页同步规则和价格。get 返回可编辑字段及约束；更新保留未提交字段，同步失败保留上次有效规则。',
    parameters: {
      action: { type: 'string', enum: ['get', 'update', 'refresh'], required: true, description: 'get 读取设置；update 保存部分配置；refresh 同步官方参考数据。' },
      patch: { type: 'json', description: 'update 时提交配置对象；字段与约束由 get 返回。' },
      expectedRevision: { type: 'string', description: 'update 时可传 get 返回的 configVersion，防止覆盖其他窗口修改。' },
    }, output,
    execute: async (args, exec) => args.action === 'get' ? controller.settings()
      : args.action === 'update' ? controller.updateConfig(args.patch, args.expectedRevision)
      : controller.refreshPolicy(exec.signal),
    timeoutMs: 20000,
  }))
}
