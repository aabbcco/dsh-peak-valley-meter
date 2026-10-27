import test from 'node:test'
import assert from 'node:assert/strict'
import { parseOfficialPage, parseOfficialPages, fetchOfficialPolicy } from '../lib/official.js'
import { pricingPage, officialFetcher } from './pricing-fixture.js'

test('official tables with rowspans and bilingual rules parse completely', () => {
  const policy = parseOfficialPages(pricingPage('zh'), pricingPage('en'), Date.parse('2026-10-22T00:00:00+08:00'))
  assert.deepEqual(policy.windows, [[1, 4], [6, 10]])
  assert.equal(policy.weekendAllValley, true)
  assert.equal(policy.holidaysAllValley, true)
  assert.equal(policy.prices['deepseek-flash'].peak.output, 8)
  assert.equal(policy.prices['deepseek-flash'].offPeak.cacheHit, .02)
  assert.equal(policy.prices['deepseek-v4-pro'].offPeak.output, 13.5)
})

test('unknown wording, model changes, partial prices and conflicting locales fail closed', () => {
  const zh = pricingPage('zh'), en = pricingPage('en')
  for (const invalid of [
    zh.replace('不含中国法定节假日', '特殊优惠日除外'),
    zh.replace('deepseek-flash', 'deepseek-new-model'),
    zh.replace('4元', '免费'),
    zh.replace('8元', '9元'),
    zh.replace('9:00 - 12:00', '9:00 - 25:00'),
    zh.replace('9:00 - 12:00、14:00 - 18:00', '9:00 - 15:00、14:00 - 18:00'),
    zh.replace('9:00 - 12:00', '9:00 - 12:00（另有条件）'),
  ]) assert.throws(() => parseOfficialPage(invalid, 'zh'))
  assert.throws(() => parseOfficialPages(zh, en.replace('01:00 - 04:00', '02:00 - 04:00')), /不一致/)
})

test('fetch validates response type, size, network failure and cancellation', async () => {
  const policy = await fetchOfficialPolicy({ fetcher: officialFetcher })
  assert.equal(policy.prices['deepseek-flash'].peak.cacheMiss, 2)
  await assert.rejects(fetchOfficialPolicy({ fetcher: async () => new Response('{}', { headers: { 'content-type': 'application/json' } }) }), /不是 HTML/)
  await assert.rejects(fetchOfficialPolicy({ fetcher: async () => new Response('offline', { status: 503 }) }), /503/)
  await assert.rejects(fetchOfficialPolicy({ fetcher: async () => new Response('x'.repeat(2_000_001), { headers: { 'content-type': 'text/html' } }) }), /过大/)
  let cancelled = 0
  await assert.rejects(fetchOfficialPolicy({ fetcher: async () => new Response(new ReadableStream({ cancel() { cancelled++ } }), { status: 503, headers: { 'content-type': 'text/html' } }) }), /503/)
  assert.equal(cancelled, 2)
  const signal = AbortSignal.abort(new Error('cancelled'))
  await assert.rejects(fetchOfficialPolicy({ signal, fetcher: async (_url, options) => { options.signal.throwIfAborted() } }), /cancelled/)
})
