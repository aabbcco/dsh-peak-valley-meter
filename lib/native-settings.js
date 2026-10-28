import { readConfig, validatePatch } from './config.js'

export function parseRevision(value) {
  if (value === undefined) return undefined
  if (typeof value === 'string') {
    if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error('配置版本无效，请重新读取设置后再保存')
    value = Number(value)
  }
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('配置版本无效，请重新读取设置后再保存')
  return value
}

export class NativeSettings {
  constructor(namespace = null, service = null) {
    this.namespace = typeof namespace === 'string' && namespace ? namespace : null
    this.service = service
  }
  bind(service) {
    this.service = service
    return () => { if (this.service === service) this.service = null }
  }
  snapshot(config) {
    const fallback = { settings: readConfig(config), configNamespace: this.namespace, configVersion: null, configWritable: false }
    if (!this.namespace || !this.service) return fallback
    try {
      const descriptor = this.service.describe({ redactSecrets: true }).find(row => row.ns === this.namespace)
      if (!descriptor || !Number.isSafeInteger(descriptor.revision) || descriptor.revision < 0) return fallback
      return {
        settings: readConfig(descriptor.value), configNamespace: this.namespace,
        configVersion: String(descriptor.revision),
        configWritable: this.service.writable === true && typeof this.service.mutate === 'function',
      }
    } catch (error) {
      return { ...fallback, configError: error.message }
    }
  }
  async update(input, expectedRevision) {
    const expected = parseRevision(expectedRevision)
    const patch = validatePatch(input)
    if (Object.hasOwn(patch, 'usageFloatColor') && !Object.hasOwn(patch, 'usageFloatFollowPeriod')) patch.usageFloatFollowPeriod = false
    const service = this.service
    if (!this.namespace || service?.writable !== true || typeof service.mutate !== 'function') throw new Error('当前设置暂时无法保存，请重新连接后重试')
    const descriptor = service.describe({ redactSecrets: true }).find(row => row.ns === this.namespace)
    if (!descriptor || !Number.isSafeInteger(descriptor.revision) || descriptor.revision < 0) throw new Error('当前设置暂时无法保存，请重新连接后重试')
    const ops = Object.entries(patch).flatMap(([key, value]) => key === 'reminders'
      ? Object.entries(value).map(([name, child]) => ({ op: 'set', path: [key, name], value: child }))
      : [{ op: 'set', path: [key], value }])
    // The Host owns revision checking and persistence. Never retry a conflict
    // with a newly read revision or maintain a second JSON configuration store.
    if (ops.length) await service.mutate(this.namespace, ops, expected)
  }
}
