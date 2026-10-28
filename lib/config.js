import Schema from '@deepseek-ai/schemastery'
import { isVolatile } from '@deepseek-ai/cosmokit'
import { normalizeWindows } from './policy.js'

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const field = (schema, value, description) => schema.default(value).description(description).volatile()
const choice = values => Schema.union(values)
const color = () => Schema.string().pattern(/^#[0-9a-f]{6}$/i)
const text = max => Schema.string().min(1).max(max).pattern(/\S/)

// The exported graph is a real Schemastery schema. Every editable field has one
// fixed volatile path, so native Settings/ConfigEditor can edit it without remounting.
export const Config = Schema.object({
  timezone: field(text(80), 'Asia/Shanghai', 'IANA 显示时区；计费日期始终按北京时间'),
  peakLabel: field(text(40), '梁文峰', '峰时名称，1–40 字符'),
  valleyLabel: field(text(40), '梁文谷', '谷时名称，1–40 字符'),
  peakWindows: field(Schema.array(Schema.array(Schema.number()).min(2).max(2)).max(6), [[1, 4], [6, 10]], 'UTC 小时窗口，最多6个，支持跨日和分钟精度'),
  weekendAllValley: field(Schema.boolean(), true, '周末全天谷时'),
  holidaysAllValley: field(Schema.boolean(), true, '节假日全天谷时'),
  currency: field(text(8), '¥', '自定义币种符号，1–8 字符'),
  peakPrice: field(Schema.number().min(0).max(1_000_000), 8, '自定义峰价，0–1000000'),
  valleyPrice: field(Schema.number().min(0).max(1_000_000), 4, '自定义谷价，0–1000000'),
  priceUnit: field(text(40), '/1M tokens', '自定义价格单位，1–40 字符'),
  peakColor: field(color(), '#f5941b', '峰时颜色，#RRGGBB'),
  valleyColor: field(color(), '#3b6ef5', '谷时颜色，#RRGGBB'),
  position: field(choice(['sidebar', 'dock', 'header', 'input-left', 'input-right', 'off']), 'sidebar', '标签显示位置'),
  showCountdown: field(Schema.boolean(), true, '显示倒计时'),
  showPrice: field(Schema.boolean(), true, '显示价格'),
  showBar: field(Schema.boolean(), false, '显示时间条'),
  showClock: field(Schema.boolean(), false, '显示时钟'),
  priceMode: field(choice(['official', 'custom']), 'official', '官方参考价或自定义价格'),
  model: field(choice(['deepseek-flash', 'deepseek-v4-pro']), 'deepseek-flash', '官方参考模型'),
  priceKind: field(choice(['cacheHit', 'cacheMiss', 'output']), 'output', '官方价格项目'),
  ruleMode: field(choice(['official', 'custom']), 'official', '官方时段或自定义规则'),
  autoUpdate: field(Schema.boolean(), true, '自动检查官方规则'),
  showUsageFloat: field(Schema.boolean(), true, '显示调用消耗飘字'),
  usageFloatUnit: field(choice(['tokens', 'cny']), 'tokens', '飘字单位'),
  usageFloatColor: field(color(), '#3b6ef5', '飘字颜色，#RRGGBB'),
  usageFloatFollowPeriod: field(Schema.boolean(), true, '飘字跟随峰谷颜色'),
  usageFloatDuration: field(Schema.number().min(1).max(8), 3, '飘动时长，1–8 秒'),
  reminders: field(Schema.object({
    beforeMinutes: Schema.number().step(1).min(1).max(60).default(10),
    beforePeak: Schema.boolean().default(false),
    beforeValley: Schema.boolean().default(false),
    onPeak: Schema.boolean().default(false),
    onValley: Schema.boolean().default(false),
  }), {}, '应用内提醒设置'),
})

function plain(value) {
  if (isVolatile(value)) return plain(value.get())
  if (Array.isArray(value)) return value.map(plain)
  if (record(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, plain(child)]))
  return value
}

function checkInput(value) {
  if (!record(value)) throw new Error('配置必须是对象')
  for (const [key, item] of Object.entries(value)) {
    if (!Object.hasOwn(Config.dict, key)) throw new Error(`未知配置字段：${key}`)
    if (item === null || item === undefined) throw new Error(`${key} 不能为 null 或 undefined`)
  }
  if (Object.hasOwn(value, 'reminders')) {
    if (!record(value.reminders)) throw new Error('提醒设置必须是对象')
    for (const [key, item] of Object.entries(value.reminders)) {
      if (!Object.hasOwn(Config.dict.reminders.dict, key)) throw new Error(`未知提醒字段：${key}`)
      if (item === null || item === undefined) throw new Error(`${key} 不能为 null 或 undefined`)
    }
  }
}

// rc.3 has no Schema.check(). Keep Host-only constraints at the Standard Schema
// validation boundary, while leaving toJSON() and its native schema graph intact.
const nativeValidate = Config['~standard'].validate
Object.defineProperty(Config, '~standard', { value: {
  version: 1, vendor: 'schemastery',
  validate(input) {
    try {
      const raw = input === undefined ? {} : plain(input)
      checkInput(raw)
      const result = nativeValidate(structuredClone(raw))
      if (result.issues) return result
      const value = plain(result.value)
      new Intl.DateTimeFormat('en', { timeZone: value.timezone }).format(0)
      normalizeWindows(value.peakWindows)
      for (const key of ['peakPrice', 'valleyPrice', 'usageFloatDuration']) {
        if (!Number.isFinite(value[key])) throw new Error(`${key} 必须是有限数字`)
      }
      return result
    } catch (error) {
      return { issues: [{ message: error.message }] }
    }
  },
} })

function parse(input) {
  const result = Config['~standard'].validate(input)
  if (result.issues) throw new TypeError(result.issues.map(issue => issue.message).join('; '))
  return result.value
}

export const DEFAULTS = Object.freeze(plain(parse({})))
export const CONFIG_FIELDS = Object.fromEntries(Object.entries(Config.dict).map(([key, schema]) => [key, {
  type: schema.type,
  ...structuredClone(schema.meta),
  ...(schema.type === 'union' && schema.list.every(option => option.type === 'const')
    ? { enum: schema.list.map(option => option.value) } : {}),
  schema: schema.toJSON(),
}]))

export function resolveConfig(raw = {}) { return plain(parse(raw)) }
export function readConfig(config = {}) { return resolveConfig(plain(config)) }

// Patch validation uses the exact same Config schema. Only submitted paths are
// returned; schema defaults must never become accidental profile overrides.
export function validatePatch(patch) {
  checkInput(patch)
  const checked = resolveConfig(patch)
  return Object.fromEntries(Object.keys(patch).map(key => [key, key === 'reminders'
    ? Object.fromEntries(Object.keys(patch.reminders).map(name => [name, checked.reminders[name]]))
    : checked[key]]))
}
