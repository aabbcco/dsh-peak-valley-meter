// Conservative official-page parser. Page text is data, never executable code.
import { createHash } from 'node:crypto'

export const OFFICIAL_URLS = Object.freeze({
  zh: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
  en: 'https://api-docs.deepseek.com/quick_start/pricing/',
})
const MODELS = ['deepseek-flash', 'deepseek-v4-pro']
const KINDS = ['cacheHit', 'cacheMiss', 'output']

export function plainText(html) {
  return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/[\s\u200b]+/g, ' ').trim()
}

// Expand rowspans with physical row indices, keeping labels attached to prices.
function expandedRows(table) {
  const rows = [], carry = []
  for (const [rowIndex, match] of [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].entries()) {
    const row = carry[rowIndex] ?? (carry[rowIndex] = [])
    let col = 0
    for (const cell of match[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) {
      while (row[col] !== undefined) col++
      const span = (key) => Number(cell[1].match(new RegExp(`${key}=["']?(\\d+)`, 'i'))?.[1] ?? 1)
      const width = span('colspan'), height = span('rowspan')
      if (width > 12 || height > 20 || width < 1 || height < 1) throw new Error('官方表格跨度无法识别')
      const text = plainText(cell[2])
      for (let r = 0; r < height; r++) {
        const target = carry[rowIndex + r] ?? (carry[rowIndex + r] = [])
        for (let c = 0; c < width; c++) {
          if (target[col + c] !== undefined) throw new Error('官方表格单元格重叠')
          target[col + c] = text
        }
      }
      col += width
    }
    rows.push(row)
  }
  return rows
}

export function parseOfficialPage(html, locale) {
  if (typeof html !== 'string' || html.length > 2_000_000) throw new Error('官方页面大小异常')
  const text = plainText(html)
  const rule = locale === 'zh'
    ? text.match(/北京时间\s*周一至周五\s*[（(]\s*不含中国法定节假日\s*[）)]\s*([^。]{1,180}?)\s*为高峰时段/)
    : text.match(/Peak hours are\s+(.{1,180}?)\s+UTC,\s*Monday through Friday,\s*excluding Chinese public holidays\./i)
  const halfPrice = locale === 'zh' ? /空闲时段价格为高峰时段价格的一半/ : /Off-peak rates are half of the peak rates/i
  if (!rule || !halfPrice.test(text)) throw new Error('官方规则出现未识别措辞，保留上次有效规则，请核对官网')
  const rangePattern = /(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/g
  const windows = [...rule[1].matchAll(rangePattern)].map((m) => {
    const sh = Number(m[1]), sm = Number(m[2]), eh = Number(m[3]), em = Number(m[4])
    if (sh >= 24 || eh > 24 || sm >= 60 || em >= 60 || (eh === 24 && em !== 0)) throw new Error('官方时间窗口越界')
    const offset = locale === 'zh' ? 8 : 0
    return [((sh + sm / 60 - offset) + 24) % 24, ((eh + em / 60 - offset) + 24) % 24]
  })
  if (!windows.length || windows.length > 6 || rule[1].replace(rangePattern, '').replace(/\band\b|[\s、,，]/gi, '')) {
    throw new Error('官方高峰窗口无法完整识别')
  }
  // Only unambiguous non-overlapping windows up to 16 hours are admitted.
  const minutes = new Set()
  for (const [start, end] of windows) {
    const s = Math.round(start * 60), e = Math.round(end * 60)
    const length = (e - s + 1440) % 1440
    if (!length) throw new Error('官方高峰窗口为空或覆盖全天')
    for (let n = 0; n < length; n++) {
      const m = (s + n) % 1440
      if (minutes.has(m)) throw new Error('官方高峰窗口重叠')
      minutes.add(m)
    }
  }
  if (minutes.size > 960) throw new Error('官方高峰时长异常，请人工核对')
  windows.sort((a, b) => a[0] - b[0])
  const tables = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map((m) => expandedRows(m[0]))
  const rows = tables.find((table) => table.some((row) => row[0] === (locale === 'zh' ? '模型' : 'MODEL')))
  if (!rows) throw new Error('找不到官方模型价目表')
  const header = rows.find((row) => row[0] === (locale === 'zh' ? '模型' : 'MODEL'))
  if (header.length !== 5 || !MODELS.every((model, i) => header[i + 3] === model)) throw new Error('官方模型列表变化，保留旧表，请人工核对')
  const prices = Object.fromEntries(MODELS.map((model) => [model, { peak: {}, offPeak: {} }]))
  const seen = new Set()
  for (const row of rows) {
    const period = row[2] === (locale === 'zh' ? '高峰时段' : 'PEAK') ? 'peak'
      : row[2] === (locale === 'zh' ? '空闲时段' : 'OFF-PEAK') ? 'offPeak' : null
    if (!period) continue
    const kind = /缓存未命中|CACHE MISS/.test(row[1]) ? 'cacheMiss'
      : /缓存命中|CACHE HIT/.test(row[1]) ? 'cacheHit'
      : /tokens输出|OUTPUT TOKENS/.test(row[1]) ? 'output' : null
    if (!kind || row.length !== 5 || seen.has(`${period}/${kind}`)) throw new Error('官方计费项目无法完整识别')
    seen.add(`${period}/${kind}`)
    for (const [i, model] of MODELS.entries()) {
      const value = row[3 + i]
      const match = value.match(locale === 'zh' ? /^(\d+(?:\.\d+)?)\s*元$/ : /^\$(\d+(?:\.\d+)?)$/)
      const price = match ? Number(match[1]) : NaN
      if (!Number.isFinite(price) || price <= 0 || price > 10000) throw new Error('官方价格格式异常')
      prices[model][period][kind] = price
    }
  }
  if (seen.size !== 6) throw new Error('官方价格表不完整')
  for (const model of MODELS) for (const kind of KINDS) {
    if (Math.abs(prices[model].peak[kind] - prices[model].offPeak[kind] * 2) > 1e-9) throw new Error('官方峰谷价格比例变化，请人工核对')
  }
  return { windows, weekendAllValley: true, holidaysAllValley: true, prices }
}

export function parseOfficialPages(zh, en, now = Date.now()) {
  const chinese = parseOfficialPage(zh, 'zh'), english = parseOfficialPage(en, 'en')
  if (JSON.stringify(chinese.windows) !== JSON.stringify(english.windows)) throw new Error('官方中英文峰谷规则不一致，保留上次有效规则')
  const fingerprint = createHash('sha256').update(JSON.stringify(chinese)).digest('hex').slice(0, 10)
  return { ...chinese, version: `${new Date(now).toISOString().slice(0, 10)}-${fingerprint}`, sourceUrl: OFFICIAL_URLS.zh, verifiedAt: new Date(now).toISOString() }
}

async function readPage(url, fetcher, signal) {
  const response = await fetcher(url, { signal, redirect: 'error', headers: { accept: 'text/html' } })
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
    await response.body?.cancel().catch(() => {})
    throw new Error(!response.ok ? `官方价格页 HTTP ${response.status}` : '官方价格页不是 HTML')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('官方价格页没有响应正文')
  let size = 0, text = ''
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2_000_000) throw new Error('官方价格页过大')
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

export async function fetchOfficialPolicy({ fetcher = globalThis.fetch, signal, now = Date.now() } = {}) {
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(() => controller.abort(new Error('官方同步超时')), 12000)
  try {
    const results = await Promise.allSettled(Object.values(OFFICIAL_URLS).map((url) => readPage(url, fetcher, controller.signal)))
    const failure = results.find((r) => r.status === 'rejected')
    if (failure) throw failure.reason
    return parseOfficialPages(results[0].value, results[1].value, now)
  } finally { controller.abort(); clearTimeout(timeout); signal?.removeEventListener('abort', abort) }
}
