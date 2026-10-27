// Pure billing rules. UTC windows use [start, end); display timezone never changes billing.
export const BUILTIN_POLICY = {
  version: '2026-10-22',
  windows: [[1, 4], [6, 10]],
  weekendAllValley: true,
  holidaysAllValley: true,
  prices: {
    'deepseek-flash': {
      peak: { cacheHit: 0.04, cacheMiss: 2, output: 8 },
      offPeak: { cacheHit: 0.02, cacheMiss: 1, output: 4 },
    },
    'deepseek-v4-pro': {
      peak: { cacheHit: 0.3, cacheMiss: 9, output: 27 },
      offPeak: { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 },
    },
  },
  sourceUrl: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
  verifiedAt: '2026-10-22T00:00:00+08:00',
}

export const CALENDAR = {
  validFrom: '2026-01-01',
  validThrough: '2026-12-31',
  sourceUrl: 'https://www.gov.cn/zhengce/content/202511/content_7047090.htm',
  // Inclusive breaks from the State Council's 2026 holiday notice.
  holidays: [
    ['2026-01-01', '2026-01-03'],
    ['2026-02-15', '2026-02-23'],
    ['2026-04-04', '2026-04-06'],
    ['2026-05-01', '2026-05-05'],
    ['2026-06-19', '2026-06-21'],
    ['2026-09-25', '2026-09-27'],
    ['2026-10-01', '2026-10-07'],
  ],
  interpretation: 'Billing uses Asia/Shanghai dates. Official pricing limits peak hours to weekdays excluding holidays; every Saturday and Sunday stays off-peak, including government makeup workdays.',
  interpretationSourceUrl: BUILTIN_POLICY.sourceUrl,
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const BILLING_OFFSET = 8 * HOUR

/** Validate up to six UTC-hour windows, merge overlaps and touching boundaries.
 * Fractional hours must resolve to whole minutes. [0,24] means all day; [] means
 * no peak windows. A start greater than end wraps midnight; equal endpoints fail.
 * Output is sorted by start; a merged wrapping range, if any, appears last.
 */
export function normalizeWindows(windows) {
  if (!Array.isArray(windows) || windows.length > 6) {
    throw new TypeError('windows must be an array of at most 6 ranges')
  }
  const intervals = []
  for (const window of windows) {
    if (!Array.isArray(window) || window.length !== 2) {
      throw new TypeError('each window must contain exactly two UTC hours')
    }
    const [start, end] = window
    if (!Number.isFinite(start) || !Number.isFinite(end)
      || start < 0 || start >= 24 || end < 0 || end > 24) {
      throw new RangeError('window bounds require 0 <= start < 24 and 0 <= end <= 24')
    }
    const s = Math.round(start * 60)
    const e = Math.round(end * 60)
    if (Math.abs(start * 60 - s) > 1e-8 || Math.abs(end * 60 - e) > 1e-8) {
      throw new RangeError('window bounds must have whole-minute precision')
    }
    if (s === e) throw new RangeError('window start and end must differ; use [0,24] for all day')
    if (s < e) intervals.push([s, e])
    else {
      intervals.push([s, 1440])
      if (e > 0) intervals.push([0, e])
    }
  }
  intervals.sort((a, b) => a[0] - b[0])
  const merged = []
  for (const [start, end] of intervals) {
    const previous = merged.at(-1)
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end)
    else merged.push([start, end])
  }
  // Preserve a single circular window rather than expanding the six-range limit.
  if (merged.length > 1 && merged[0][0] === 0 && merged.at(-1)[1] === 1440) {
    const first = merged.shift()
    merged.at(-1)[1] = first[1]
  }
  return merged.map(([start, end]) => [start / 60, end / 60])
}

function billingDay(epoch) {
  const date = new Date(epoch + BILLING_OFFSET)
  return { date: date.toISOString().slice(0, 10), weekday: date.getUTCDay() }
}

function covered(date) {
  return date >= CALENDAR.validFrom && date <= CALENDAR.validThrough
}

function classify(epoch, policy, windows) {
  const { date, weekday } = billingDay(epoch)
  const calendarKnown = !policy.holidaysAllValley || covered(date)
  const result = (period, reason) => ({ period, reason, calendarKnown })
  if (policy.weekendAllValley && (weekday === 0 || weekday === 6)) {
    return result('off-peak', 'weekend')
  }
  if (policy.holidaysAllValley && CALENDAR.holidays.some(([start, end]) => date >= start && date <= end)) {
    return result('off-peak', 'holiday')
  }
  const hour = ((epoch % DAY + DAY) % DAY) / HOUR
  const inWindow = windows.some(([start, end]) => start < end
    ? hour >= start && hour < end
    : hour >= start || hour < end)
  if (!inWindow) return result('off-peak', 'off-hours')
  if (!calendarKnown) return result('unknown', 'calendar-unknown')
  return result('peak', 'window')
}

function displayClock(timezone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  return (epoch) => {
    const parts = Object.fromEntries(formatter.formatToParts(epoch).map(({ type, value }) => [type, value]))
    return { date: `${parts.year}-${parts.month}-${parts.day}`, clock: `${parts.hour}:${parts.minute}` }
  }
}

// Locate the actual local date boundaries. Binary searches handle 23/25-hour
// days and zones whose clock changes at midnight without assuming a 24h day.
function displayDayBounds(atMs, date, display) {
  const boundary = (after) => {
    let low = Math.floor(atMs - 36 * HOUR)
    let high = Math.ceil(atMs + 36 * HOUR)
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2)
      const localDate = display(middle).date
      if (after ? localDate > date : localDate >= date) high = middle
      else low = middle
    }
    return high
  }
  return [boundary(false), boundary(true)]
}

// Only these instants can change the tariff: UTC window edges or China midnight.
function boundaries(start, end, windows) {
  const points = new Set([start, end])
  for (let utcDay = Math.floor(start / DAY) * DAY - DAY; utcDay <= end; utcDay += DAY) {
    const midnight = utcDay + DAY - BILLING_OFFSET
    if (midnight > start && midnight < end) points.add(midnight)
    for (const window of windows) {
      for (const hour of window) {
        const epoch = utcDay + Math.round(hour * 60) * MINUTE
        if (epoch > start && epoch < end) points.add(epoch)
      }
    }
  }
  return [...points].sort((a, b) => a - b)
}

/** Evaluate a merged policy (windows + the two boolean calendar flags).
 * nextSwitch is the next period change, including entry to/from unknown. It is
 * null when no change occurs within 32 elapsed days. inMinutes rounds upward.
 * calendar.known/current.calendarKnown indicate whether holiday data is known
 * or unnecessary (holidaysAllValley=false); weekends/off-hours can still be
 * conclusively off-peak when calendarKnown=false. Timeline epochs are canonical
 * on DST days where local HH:MM labels can repeat or move backward.
 */
export function evaluateSchedule(policy, timezone = 'Asia/Shanghai', atMs = Date.now()) {
  if (!policy || typeof policy !== 'object') throw new TypeError('policy is required')
  if (!Number.isFinite(atMs) || !Number.isFinite(new Date(atMs).getTime())) {
    throw new RangeError('atMs must be a finite valid epoch timestamp')
  }
  const windows = normalizeWindows(policy.windows)
  const display = displayClock(timezone)
  const now = display(atMs)
  const [dayStart, dayEnd] = displayDayBounds(atMs, now.date, display)
  const current = classify(atMs, policy, windows)
  const points = boundaries(dayStart, dayEnd, windows)
  const segments = []
  for (let i = 0; i < points.length - 1; i++) {
    const startEpoch = points[i]
    const endEpoch = points[i + 1]
    const period = classify(startEpoch, policy, windows).period
    const end = endEpoch === dayEnd ? '24:00' : display(endEpoch).clock
    const previous = segments.at(-1)
    if (previous && previous.period === period) {
      previous.endEpoch = endEpoch
      previous.end = end
    } else {
      segments.push({ start: display(startEpoch).clock, end, startEpoch, endEpoch, period })
    }
  }
  let nextSwitch = null
  const horizon = atMs + 32 * DAY
  for (const epoch of boundaries(atMs, horizon, windows).slice(1)) {
    const period = classify(epoch, policy, windows).period
    if (period === current.period) continue
    const next = display(epoch)
    const tomorrow = new Date(Date.parse(`${now.date}T00:00:00Z`) + DAY).toISOString().slice(0, 10)
    nextSwitch = {
      epoch, at: next.clock, date: next.date, period,
      inMinutes: Math.ceil((epoch - atMs) / MINUTE), tomorrow: next.date === tomorrow,
    }
    break
  }
  return {
    now: now.clock, timezone, date: now.date,
    billingDate: billingDay(atMs).date, billingTimezone: 'Asia/Shanghai',
    current, nextSwitch, segments, dayStart, dayEnd,
    calendar: {
      validThrough: CALENDAR.validThrough, sourceUrl: CALENDAR.sourceUrl,
      known: current.calendarKnown,
      warning: current.calendarKnown ? null : `Holiday calendar covers only ${CALENDAR.validFrom} through ${CALENDAR.validThrough}; weekday peak windows outside coverage are unknown.`,
    },
  }
}
