import { normalizeWindows } from './policy.js'

export const DEFAULTS = Object.freeze({
  timezone: 'Asia/Shanghai', peakLabel: '梁文峰', valleyLabel: '梁文谷',
  peakWindows: [[1, 4], [6, 10]], weekendAllValley: true, holidaysAllValley: true,
  currency: '¥', peakPrice: 8, valleyPrice: 4, priceUnit: '/1M tokens',
  peakColor: '#f5941b', valleyColor: '#3b6ef5', position: 'sidebar',
  showCountdown: true, showPrice: true, showBar: false, showClock: false,
  priceMode: 'official', model: 'deepseek-flash', priceKind: 'output',
  ruleMode: 'official', autoUpdate: true,
  showUsageFloat: true, usageFloatUnit: 'tokens',
  usageFloatColor: '#3b6ef5', usageFloatFollowPeriod: true, usageFloatDuration: 3,
  reminders: { beforeMinutes: 10, beforePeak: false, beforeValley: false, onPeak: false, onValley: false },
})
const ENUMS = {
  position: ['sidebar', 'dock', 'header', 'input-left', 'input-right', 'off'],
  priceMode: ['official', 'custom'], ruleMode: ['official', 'custom'],
  model: ['deepseek-flash', 'deepseek-v4-pro'], priceKind: ['cacheHit', 'cacheMiss', 'output'],
  usageFloatUnit: ['tokens', 'cny'],
}
const BOOLS = ['usageFloatFollowPeriod', 'showUsageFloat', 'showCountdown', 'showPrice', 'showBar', 'showClock', 'weekendAllValley', 'holidaysAllValley', 'autoUpdate']
const STRINGS = { peakLabel: 40, valleyLabel: 40, currency: 8, priceUnit: 40, timezone: 80 }
const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k)
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

export const CONFIG_FIELDS = {
  timezone: 'IANA 显示时区，例如 Asia/Shanghai；计费日期始终按北京时间',
  peakLabel: '峰时名称，1–40 字符', valleyLabel: '谷时名称，1–40 字符',
  peakPrice: '自定义峰价，0–1000000', valleyPrice: '自定义谷价，0–1000000',
  currency: '自定义币种符号，1–8 字符', priceUnit: '自定义价格单位，1–40 字符',
  usageFloatColor: '#RRGGBB；指定后自动关闭跟随峰谷颜色，除非同时显式设置 usageFloatFollowPeriod',
  usageFloatDuration: '飘动时长，1–8 秒，支持小数；数值越大越慢',
  peakColor: '#RRGGBB', valleyColor: '#RRGGBB', ...ENUMS,
  ...Object.fromEntries(BOOLS.map((key) => [key, 'boolean'])),
  peakWindows: 'UTC 小时窗口，最多6个，例如 [[1,4],[6,10]]；自定义规则下生效，支持跨日和分钟精度',
  reminders: { beforeMinutes: '1–60 整数', beforePeak: 'boolean', beforeValley: 'boolean', onPeak: 'boolean', onValley: 'boolean' },
}

export function validatePatch(patch) {
  if (!record(patch)) throw new Error('配置必须是对象')
  const result = {}
  for (const [key, value] of Object.entries(patch)) {
    if (!own(CONFIG_FIELDS, key)) throw new Error(`未知配置字段：${key}`)
    if (key in ENUMS) {
      if (!ENUMS[key].includes(value)) throw new Error(`${key} 必须是 ${ENUMS[key].join(' / ')}`)
      result[key] = value
    } else if (BOOLS.includes(key)) {
      if (typeof value !== 'boolean') throw new Error(`${key} 必须是布尔值`)
      result[key] = value
    } else if (key in STRINGS) {
      if (typeof value !== 'string' || !value.trim() || value.length > STRINGS[key]) throw new Error(`${key} 长度必须为 1–${STRINGS[key]}`)
      if (key === 'timezone') {
        try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0) }
        catch { throw new Error('无效的 IANA 时区') }
      }
      result[key] = value.trim()
    } else if (key === 'usageFloatDuration') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 8) throw new Error('飘动时长必须为 1–8 秒')
      result[key] = value
    } else if (key === 'peakColor' || key === 'valleyColor' || key === 'usageFloatColor') {
      if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('颜色必须为 #RRGGBB')
      result[key] = value
    } else if (key === 'peakPrice' || key === 'valleyPrice') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000) throw new Error('价格必须为 0–1000000 的有限数字')
      result[key] = value
    } else if (key === 'peakWindows') {
      normalizeWindows(value)
      result[key] = value.map((w) => [...w])
    } else if (key === 'reminders') {
      if (!record(value)) throw new Error('提醒设置必须是对象')
      const reminders = {}
      for (const [name, flag] of Object.entries(value)) {
        if (!own(DEFAULTS.reminders, name)) throw new Error(`未知提醒字段：${name}`)
        if (name === 'beforeMinutes') {
          if (!Number.isInteger(flag) || flag < 1 || flag > 60) throw new Error('提前提醒时间必须为 1–60 分钟')
        } else if (typeof flag !== 'boolean') throw new Error(`${name} 必须是布尔值`)
        reminders[name] = flag
      }
      result[key] = reminders
    }
  }
  return result
}

export function resolveConfig(raw = {}, stored = {}, warnings = []) {
  // Loading legacy configuration is deliberately separate from validating edits.
  const explicit = { ...raw, ...stored }
  if (record(raw.reminders) || record(stored.reminders)) explicit.reminders = { ...raw.reminders, ...stored.reminders }
  const accepted = {}
  for (const [key, original] of Object.entries(explicit)) {
    if (!own(CONFIG_FIELDS, key) || original === undefined || (key === 'timezone' && !original)) continue
    let value = original
    if ((key === 'peakPrice' || key === 'valleyPrice') && typeof value === 'string' && value.trim()) value = Number(value)
    if ((key === 'peakColor' || key === 'valleyColor') && typeof value === 'string'
      && /^(?:[a-z]+|#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%+/-]+\))$/i.test(value.trim())) {
      accepted[key] = value.trim()
      continue
    }
    try { Object.assign(accepted, validatePatch({ [key]: value })) }
    catch (error) { warnings.push(`${key} 使用默认值：${error.message}`) }
  }
  const legacyCustom = !own(explicit, 'priceMode') && ['peakPrice', 'valleyPrice', 'currency', 'priceUnit'].some((key) => own(explicit, key))
  if (legacyCustom) {
    accepted.priceMode = 'custom'
    if (!own(accepted, 'peakPrice')) accepted.peakPrice = 9
    if (!own(accepted, 'valleyPrice')) accepted.valleyPrice = 4.5
  }
  if (!own(explicit, 'ruleMode') && own(explicit, 'peakWindows')) accepted.ruleMode = 'custom'
  return { ...DEFAULTS, ...accepted, peakWindows: (accepted.peakWindows ?? DEFAULTS.peakWindows).map((w) => [...w]),
    reminders: { ...DEFAULTS.reminders, ...accepted.reminders } }
}
