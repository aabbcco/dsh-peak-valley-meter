import test from 'node:test'
import assert from 'node:assert/strict'
import { BUILTIN_POLICY, CALENDAR, normalizeWindows, evaluateSchedule } from '../lib/policy.js'
import { Config, CONFIG_FIELDS, DEFAULTS, resolveConfig, validatePatch, readConfig } from '../lib/config.js'

test('native Config declares every editable field volatile with serializable schema and defaults', () => {
  assert.equal(typeof Config, 'function')
  assert.equal(typeof Config.toJSON, 'function')
  assert.equal(typeof Config['~standard'].validate, 'function')
  assert.equal(Config.type, 'object')
  for (const [key, schema] of Object.entries(Config.dict)) assert.equal(schema.meta.volatile, true, key)
  assert.doesNotThrow(() => JSON.stringify(Config.toJSON()))
  const parsed = Config['~standard'].validate({})
  assert.equal(parsed.issues, undefined)
  assert.equal(typeof parsed.value.peakLabel.get, 'function')
  assert.deepEqual(readConfig(parsed.value), DEFAULTS)
  assert.equal(DEFAULTS.priceMode, 'official')
  assert.equal(DEFAULTS.ruleMode, 'official')
  assert.deepEqual(CONFIG_FIELDS.position.enum, Config.dict.position.list.map(option => option.value))
  assert.deepEqual(CONFIG_FIELDS.priceMode.enum, ['official', 'custom'])
  assert.equal(CONFIG_FIELDS.position.default, DEFAULTS.position)
  assert.equal(CONFIG_FIELDS.peakPrice.type, 'number')
  assert.equal(CONFIG_FIELDS.peakPrice.min, 0)
  assert.equal(CONFIG_FIELDS.peakPrice.max, 1_000_000)
  assert.ok(CONFIG_FIELDS.reminders.schema.refs)
  assert.doesNotThrow(() => JSON.stringify(CONFIG_FIELDS))
})

test('partial setting validation never fills missing patch paths or infers legacy modes', () => {
  assert.deepEqual(validatePatch({ peakLabel: '忙时' }), { peakLabel: '忙时' })
  assert.deepEqual(validatePatch({ reminders: { onPeak: true } }), { reminders: { onPeak: true } })
  assert.equal(resolveConfig({ peakPrice: 12 }).priceMode, 'official')
  assert.equal(resolveConfig({ peakWindows: [] }).ruleMode, 'official')
  const copy = resolveConfig()
  copy.reminders.beforePeak = true
  copy.peakWindows[0][0] = 0
  assert.equal(resolveConfig().reminders.beforePeak, false)
  assert.deepEqual(resolveConfig().peakWindows, [[1, 4], [6, 10]])
})

test('Config and patch validation reject the same invalid field values', () => {
  for (const patch of [
    { timezone: 'bad/zone' }, { timezone: '' }, { peakLabel: '   ' }, { peakLabel: 'x'.repeat(41) },
    { peakPrice: -1 }, { peakPrice: NaN }, { peakPrice: Infinity }, { valleyPrice: '4.5' },
    { peakColor: 'red' }, { valleyColor: 'url(evil)' }, { usageFloatColor: '#123' },
    { usageFloatDuration: 0 }, { usageFloatDuration: 9 }, { showClock: 'true' },
    { unknown: true }, { priceMode: 'legacy' }, { peakWindows: [[1.001, 2]] },
    { peakWindows: [[1, 1]] }, { peakWindows: [[1, 2, 3]] },
    { reminders: { beforeMinutes: 0 } }, { reminders: { beforeMinutes: 1.5 } },
    { reminders: { unknown: false } }, { reminders: null }, { showPrice: null },
  ]) {
    assert.ok(Config['~standard'].validate(patch).issues, JSON.stringify(patch))
    assert.throws(() => validatePatch(patch), undefined, JSON.stringify(patch))
  }
})

const HOUR = 3_600_000
const schedule = (iso, timezone = 'Asia/Shanghai', overrides = {}) =>
  evaluateSchedule({ ...BUILTIN_POLICY, ...overrides }, timezone, Date.parse(iso))
const custom = { weekendAllValley: false, holidaysAllValley: false }

function checkTimeline(result, policy = BUILTIN_POLICY) {
  assert.equal(result.segments[0].startEpoch, result.dayStart)
  assert.equal(result.segments.at(-1).endEpoch, result.dayEnd)
  assert.equal(result.segments.at(-1).end, '24:00')
  for (let i = 0; i < result.segments.length; i++) {
    const segment = result.segments[i]
    assert.ok(segment.startEpoch < segment.endEpoch)
    if (i) assert.equal(result.segments[i - 1].endEpoch, segment.startEpoch)
    for (const epoch of [segment.startEpoch, Math.floor((segment.startEpoch + segment.endEpoch) / 2), segment.endEpoch - 1]) {
      assert.equal(evaluateSchedule(policy, result.timezone, epoch).current.period, segment.period)
    }
  }
}

test('official policy prices and dated calendar provenance', () => {
  assert.equal(BUILTIN_POLICY.version, '2026-10-22')
  assert.equal(BUILTIN_POLICY.verifiedAt, '2026-10-22T00:00:00+08:00')
  assert.deepEqual(BUILTIN_POLICY.prices, {
    'deepseek-flash': { peak: { cacheHit: 0.04, cacheMiss: 2, output: 8 }, offPeak: { cacheHit: 0.02, cacheMiss: 1, output: 4 } },
    'deepseek-v4-pro': { peak: { cacheHit: 0.3, cacheMiss: 9, output: 27 }, offPeak: { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 } },
  })
  assert.equal(CALENDAR.validFrom, '2026-01-01')
  assert.equal(CALENDAR.validThrough, '2026-12-31')
  assert.match(CALENDAR.sourceUrl, /gov.cn/)
  assert.match(CALENDAR.interpretation, /makeup workdays/)
  assert.equal(CALENDAR.interpretationSourceUrl, BUILTIN_POLICY.sourceUrl)
})

test('normalization merges overlaps and adjacency without mutating inputs', () => {
  const input = [[6, 10], [1, 3], [2, 4], [4, 5]]
  const before = structuredClone(input)
  assert.deepEqual(normalizeWindows(input), [[1, 5], [6, 10]])
  assert.deepEqual(input, before)
  assert.deepEqual(normalizeWindows([[22, 2], [1, 3], [21, 23]]), [[21, 3]])
  assert.deepEqual(normalizeWindows([[22, 0]]), [[22, 24]])
  assert.deepEqual(normalizeWindows([[22, 2], [2, 22]]), [[0, 24]])
  assert.deepEqual(normalizeWindows([]), [])
  assert.deepEqual(normalizeWindows([[0, 24]]), [[0, 24]])
  assert.deepEqual(normalizeWindows([[1 + 1 / 60, 2.5]]), [[1 + 1 / 60, 2.5]])
  const six = [[23, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11]]
  const normalized = normalizeWindows(six)
  assert.equal(normalized.length, 6)
  assert.deepEqual(normalizeWindows(normalized), normalized)
})

test('normalization rejects malformed, excessive, out-of-range and subminute windows', () => {
  for (const windows of [null, {}, [[1]], [[1, 2, 3]], [['1', 2]], [[NaN, 2]], [[1, Infinity]], [[-1, 3]], [[24, 3]], [[1, 25]], [[1, -1]], [[0, 0]], [[2, 2]], [[1.001, 2]], Array.from({ length: 7 }, () => [1, 2])]) {
    assert.throws(() => normalizeWindows(windows), undefined, JSON.stringify(windows))
  }
})

test('all four daily half-open boundaries and subminute countdown', () => {
  for (const [clock, period] of [
    ['08:59:59.999', 'off-peak'], ['09:00:00.000', 'peak'],
    ['11:59:59.999', 'peak'], ['12:00:00.000', 'off-peak'],
    ['13:59:59.999', 'off-peak'], ['14:00:00.000', 'peak'],
    ['17:59:59.999', 'peak'], ['18:00:00.000', 'off-peak'],
  ]) assert.equal(schedule(`2026-10-22T${clock}+08:00`).current.period, period, clock)
  assert.equal(schedule('2026-10-22T08:59:59.999+08:00').nextSwitch.inMinutes, 1)
  const result = schedule('2026-10-22T09:00:00+08:00')
  assert.deepEqual(result.current, { period: 'peak', reason: 'window', calendarKnown: true })
  assert.deepEqual(result.segments.map(({ start, end, period }) => [start, end, period]), [
    ['00:00', '09:00', 'off-peak'], ['09:00', '12:00', 'peak'],
    ['12:00', '14:00', 'off-peak'], ['14:00', '18:00', 'peak'], ['18:00', '24:00', 'off-peak'],
  ])
  checkTimeline(result)
})

test('Friday 18:00 skips the whole weekend to Monday 09:00', () => {
  const result = schedule('2026-10-23T18:00:00+08:00')
  assert.equal(result.current.period, 'off-peak')
  assert.deepEqual(result.nextSwitch, {
    epoch: Date.parse('2026-10-26T09:00:00+08:00'), at: '09:00', date: '2026-10-26',
    period: 'peak', inMinutes: 63 * 60, tomorrow: false,
  })
  const saturday = schedule('2026-10-24T10:00:00+08:00')
  assert.equal(saturday.current.reason, 'weekend')
  assert.equal(saturday.segments.length, 1)
  const sunday = schedule('2026-10-25T18:00:00+08:00')
  assert.equal(sunday.nextSwitch.tomorrow, true)
})

test('all government holiday break dates are off-peak and October resumes on October 8', () => {
  for (const [start, end] of CALENDAR.holidays) {
    for (let day = Date.parse(`${start}T00:00:00Z`); day <= Date.parse(`${end}T00:00:00Z`); day += 24 * HOUR) {
      const iso = new Date(day).toISOString().slice(0, 10)
      assert.equal(schedule(`${iso}T10:00:00+08:00`).current.period, 'off-peak', iso)
    }
  }
  const result = schedule('2026-10-01T09:00:00+08:00')
  assert.equal(result.current.reason, 'holiday')
  assert.equal(result.nextSwitch.epoch, Date.parse('2026-10-08T09:00:00+08:00'))
  assert.equal(result.nextSwitch.inMinutes, 7 * 24 * 60)
  assert.equal(result.segments.length, 1)
  assert.equal(schedule('2026-10-08T09:00:00+08:00').current.period, 'peak')
  assert.equal(schedule('2026-10-10T09:00:00+08:00').current.reason, 'weekend', 'Saturday makeup workday remains off-peak')
  assert.equal(schedule('2026-02-14T09:00:00+08:00').current.reason, 'weekend')
  assert.equal(schedule('2026-02-13T18:00:00+08:00').nextSwitch.epoch, Date.parse('2026-02-24T09:00:00+08:00'))
})

test('billing uses China date and weekday regardless of display date', () => {
  const result = schedule('2026-10-22T01:30:00Z', 'America/New_York')
  assert.equal(result.date, '2026-10-21')
  assert.equal(result.billingDate, '2026-10-22')
  assert.equal(result.billingTimezone, 'Asia/Shanghai')
  assert.equal(result.now, '21:30')
  assert.equal(result.current.period, 'peak')
  const policy = { windows: [[0, 24]] }
  const saturday = schedule('2026-10-23T16:00:00Z', 'UTC', policy)
  assert.equal(saturday.date, '2026-10-23')
  assert.equal(saturday.billingDate, '2026-10-24')
  assert.equal(saturday.current.reason, 'weekend')
  assert.equal(schedule('2026-10-23T15:59:59.999Z', 'UTC', policy).current.period, 'peak')
  assert.equal(schedule('2026-09-30T16:00:00Z', 'UTC', policy).current.reason, 'holiday')
  checkTimeline(result)
})

test('New York spring DST timeline covers 23 real hours with correct labels', () => {
  const policy = { ...BUILTIN_POLICY, ...custom, windows: [[6.5, 7.5]] }
  const result = evaluateSchedule(policy, 'America/New_York', Date.parse('2026-03-08T07:00:00Z'))
  assert.equal(result.date, '2026-03-08')
  assert.equal(result.dayStart, Date.parse('2026-03-08T05:00:00Z'))
  assert.equal(result.dayEnd, Date.parse('2026-03-09T04:00:00Z'))
  assert.equal(result.dayEnd - result.dayStart, 23 * HOUR)
  const peak = result.segments.find(({ period }) => period === 'peak')
  assert.equal(peak.start, '01:30')
  assert.equal(peak.end, '03:30')
  assert.equal(peak.endEpoch - peak.startEpoch, HOUR)
  assert.equal(result.nextSwitch.inMinutes, 30)
  checkTimeline(result, policy)
})

test('New York fall DST timeline preserves repeated local hours through epochs', () => {
  const policy = { ...BUILTIN_POLICY, ...custom, windows: [[5.5, 6.25]] }
  const result = evaluateSchedule(policy, 'America/New_York', Date.parse('2026-11-01T06:00:00Z'))
  assert.equal(result.dayStart, Date.parse('2026-11-01T04:00:00Z'))
  assert.equal(result.dayEnd, Date.parse('2026-11-02T05:00:00Z'))
  assert.equal(result.dayEnd - result.dayStart, 25 * HOUR)
  const peak = result.segments.find(({ period }) => period === 'peak')
  assert.equal(peak.start, '01:30')
  assert.equal(peak.end, '01:15')
  assert.equal(peak.endEpoch - peak.startEpoch, 45 * 60_000)
  assert.equal(result.nextSwitch.inMinutes, 15)
  checkTimeline(result, policy)
})

test('unknown 2027 holidays do not imply confirmed weekday peak pricing', () => {
  const result = schedule('2027-01-04T09:00:00+08:00')
  assert.deepEqual(result.current, { period: 'unknown', reason: 'calendar-unknown', calendarKnown: false })
  assert.equal(result.calendar.known, false)
  assert.match(result.calendar.warning, /2026-12-31/)
  assert.equal(result.nextSwitch.period, 'off-peak')
  assert.equal(result.nextSwitch.at, '12:00')
  const offHours = schedule('2027-01-04T08:00:00+08:00')
  assert.equal(offHours.current.period, 'off-peak')
  assert.equal(offHours.current.reason, 'off-hours')
  assert.equal(offHours.nextSwitch.period, 'unknown')
  assert.equal(offHours.nextSwitch.at, '09:00')
  const weekend = schedule('2027-01-02T09:00:00+08:00')
  assert.equal(weekend.current.reason, 'weekend')
  assert.equal(weekend.nextSwitch.period, 'unknown')
  assert.equal(weekend.nextSwitch.date, '2027-01-04')
  checkTimeline(result)
})

test('next switch crosses calendar expiry without skipping unknown January 1', () => {
  const result = schedule('2026-12-31T18:00:00+08:00')
  assert.equal(result.nextSwitch.epoch, Date.parse('2027-01-01T09:00:00+08:00'))
  assert.equal(result.nextSwitch.period, 'unknown')
  assert.equal(result.nextSwitch.tomorrow, true)
  const nonstop = schedule('2026-12-31T23:00:00+08:00', 'UTC', { windows: [[0, 24]] })
  assert.equal(nonstop.nextSwitch.epoch, Date.parse('2027-01-01T00:00:00+08:00'))
  assert.equal(nonstop.nextSwitch.period, 'unknown')
  assert.equal(schedule('2025-12-31T09:00:00+08:00').current.period, 'unknown')
})

test('custom flags independently disable weekends and holidays', () => {
  assert.equal(schedule('2026-10-10T09:00:00+08:00', 'UTC', { weekendAllValley: false }).current.period, 'peak')
  assert.equal(schedule('2026-10-01T09:00:00+08:00', 'UTC', { holidaysAllValley: false }).current.period, 'peak')
  const result = schedule('2027-01-04T09:00:00+08:00', 'Asia/Shanghai', { holidaysAllValley: false })
  assert.equal(result.current.period, 'peak')
  assert.equal(result.calendar.known, true)
  assert.equal(result.calendar.warning, null)
})

test('fractional, overlapping and wrapping custom windows use exact minute boundaries', () => {
  const overrides = { ...custom, windows: [[22.5, 1.5], [1, 2.25]] }
  assert.equal(schedule('2026-10-22T22:29:59.999Z', 'UTC', overrides).current.period, 'off-peak')
  assert.equal(schedule('2026-10-22T22:30:00Z', 'UTC', overrides).current.period, 'peak')
  assert.equal(schedule('2026-10-23T02:14:59.999Z', 'UTC', overrides).current.period, 'peak')
  assert.equal(schedule('2026-10-23T02:15:00Z', 'UTC', overrides).current.period, 'off-peak')
  const result = schedule('2026-10-22T23:00:00Z', 'UTC', overrides)
  assert.equal(result.nextSwitch.epoch, Date.parse('2026-10-23T02:15:00Z'))
  assert.equal(result.nextSwitch.inMinutes, 195)
  assert.equal(result.nextSwitch.tomorrow, true)
  checkTimeline(result, { ...BUILTIN_POLICY, ...overrides })
})

test('nonstop and empty policies have no artificial next switch', () => {
  for (const [windows, period] of [[[[0, 24]], 'peak'], [[], 'off-peak']]) {
    const result = schedule('2026-10-22T10:00:00+08:00', 'Asia/Shanghai', { ...custom, windows })
    assert.equal(result.current.period, period)
    assert.equal(result.nextSwitch, null)
    assert.equal(result.segments.length, 1)
  }
  assert.equal(schedule('2027-01-04T10:00:00+08:00', 'UTC', { windows: [] }).current.period, 'off-peak')
  assert.equal(schedule('2027-01-04T10:00:00+08:00', 'UTC', { windows: [] }).nextSwitch, null)
})

test('invalid times and display zones fail explicitly', () => {
  assert.throws(() => evaluateSchedule(BUILTIN_POLICY, 'Not/A_Zone', Date.now()), RangeError)
  assert.throws(() => evaluateSchedule(BUILTIN_POLICY, 'UTC', NaN), RangeError)
  assert.throws(() => evaluateSchedule(BUILTIN_POLICY, 'UTC', Infinity), RangeError)
  assert.throws(() => evaluateSchedule(null), TypeError)
})
