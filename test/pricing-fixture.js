// Minimal table/footnote fixture matching the official pages inspected 2026-10-22.
export function pricingPage(locale = 'zh') {
  const zh = locale === 'zh'
  const labels = zh ? ['百万tokens输入<br>（缓存命中）', '百万tokens输入<br>（缓存未命中）', '百万tokens输出']
    : ['1M INPUT TOKENS<br>(CACHE HIT)', '1M INPUT TOKENS<br>(CACHE MISS)', '1M OUTPUT TOKENS']
  const values = zh ? [[.02, .15, .04, .3], [1, 4.5, 2, 9], [4, 13.5, 8, 27]]
    : [[.003, .022, .006, .044], [.15, .66, .3, 1.32], [.6, 1.98, 1.2, 3.96]]
  const price = (n) => zh ? `${n}元` : `$${n}`
  return `<html><table><tr><th colspan="3">${zh ? '模型' : 'MODEL'}</th><th>deepseek-flash<sup>(1)</sup></th><th>deepseek-v4-pro</th></tr>`
    + values.map((v, i) => `<tr>${i === 0 ? `<td rowspan="6">${zh ? '价格' : 'PRICING'}<sup>(2)</sup></td>` : ''}<td rowspan="2">${labels[i]}</td><td>${zh ? '空闲时段' : 'OFF-PEAK'}</td><td>${price(v[0])}</td><td>${price(v[1])}</td></tr><tr><td>${zh ? '高峰时段' : 'PEAK'}</td><td>${price(v[2])}</td><td>${price(v[3])}</td></tr>`).join('')
    + '</table><p>' + (zh ? '(2) 空闲时段价格为高峰时段价格的一半。北京时间周一至周五（不含中国法定节假日）9:00 - 12:00、14:00 - 18:00 为高峰时段；其余时段，包括周末及中国法定节假日全天均为空闲时段。'
      : '(2) Off-peak rates are half of the peak rates. Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday, excluding Chinese public holidays. All other hours are off-peak, including weekends and Chinese public holidays in full.') + '</p></html>'
}
export const officialFetcher = async (url) => new Response(pricingPage(url.includes('/zh-cn/') ? 'zh' : 'en'), { headers: { 'content-type': 'text/html; charset=utf-8' } })
