import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute only the factory and pure controller seam. No DOM or React renderer.
let plugin;
vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
  window: { __ModuleLoader__: { load(definition) {
    assert.equal(definition.id, 'dsh-peak-valley-meter');
    plugin = definition.factory((name) => { assert.equal(name, 'react'); return { memo: (component) => component }; });
  } } }
});
const logic = plugin.__test;
const plain = (value) => JSON.parse(JSON.stringify(value));
const minute = 60_000;
const epoch = Date.UTC(2026, 9, 21, 1);
const status = (overrides = {}) => ({
  serverNow: epoch, configVersion: 'a',
  settings: { position: 'input-left', peakLabel: 'P', valleyLabel: 'V', reminders: { beforeMinutes: 10, beforePeak: true, beforeValley: true, onPeak: true, onValley: true } },
  current: { period: 'off-peak' },
  nextSwitch: { epoch: epoch + 20 * minute, period: 'peak', label: 'P' },
  ...overrides
});
async function settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { resolve, promise }; }
function environment() {
  let wall = epoch + 9 * 3600_000; // Client wall clock is deliberately wrong.
  let mono = 500;
  let visible = true;
  let sequence = 0;
  const timers = new Map();
  const intervals = new Map();
  const values = new Map();
  const env = {
    wall: () => wall, monotonic: () => mono, visible: () => visible,
    storage: { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) },
    setTimeout: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, at: mono + delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn) => { const id = ++sequence; intervals.set(id, fn); return id; },
    clearInterval: (id) => intervals.delete(id),
    advance(ms, wallMs = ms) { wall += wallMs; mono += ms; for (const fn of [...intervals.values()]) fn(); },
    fireDue() { for (const [id, timer] of [...timers]) if (timer.at <= mono) { timers.delete(id); timer.fn(); } },
    setVisible(value) { visible = value; },
    intervals, timers
  };
  return env;
}

test('preview uses unsaved choices without mutating settings or requiring enabled effects', () => {
  const draft = { showUsageFloat: false, usageFloatUnit: 'cny', usageFloatColor: '#ff66aa', usageFloatFollowPeriod: false, usageFloatDuration: '5.5', peakColor: '#ff0000', valleyColor: '#0000ff' };
  const before = structuredClone(draft);
  const preview = logic.usagePreviewSample(draft, 'off-peak');
  assert.equal(preview.text, '≈−0.0123 元');
  assert.equal(preview.color, '#ff66aa');
  assert.equal(preview.duration, 5500);
  assert.deepEqual(draft, before);
  assert.equal(logic.usagePreviewSample({ ...draft, usageFloatFollowPeriod: true, usageFloatUnit: 'tokens' }, 'peak').color, '#ff0000');
  assert.equal(logic.usagePreviewSample({ ...draft, usageFloatUnit: 'tokens' }, 'peak').text, '−1,234 tokens');
  assert.throws(() => logic.usagePreviewSample({ ...draft, usageFloatDuration: '' }, 'peak'), /invalidFloatDuration/);
});

test('usage float formatting distinguishes reference CNY and token fallback', () => {
  assert.equal(logic.usageFloatText({ tokens: 1234 }, 'tokens'), '−1,234 tokens');
  assert.equal(logic.usageFloatText({ tokens: 1234, costCny: .0123 }, 'cny'), '≈−0.0123 元');
  assert.equal(logic.usageFloatText({ tokens: 1234, costCny: null }, 'cny'), '−1,234 tokens');
  assert.equal(logic.usageFloatText({ tokens: 0 }, 'tokens'), null);
});

test('usage gate suppresses history, corrections, disabled records and session re-entry', () => {
  const gate = logic.createUsageGate();
  const first = { id: 'a', at: epoch, tokens: 1 };
  assert.equal(gate.take('s', { items: [first] }, epoch).length, 0);
  const second = { id: 'b', at: epoch, tokens: 2 };
  assert.equal(gate.take('s', { items: [first, second] }, epoch).length, 1);
  assert.equal(gate.take('s', { items: [first, { ...second, tokens: 3 }] }, epoch).length, 0);
  const third = { id: 'c', at: epoch, tokens: 4 };
  assert.equal(gate.take('s', { items: [third] }, epoch, false).length, 0);
  assert.equal(gate.take('s', { items: [third] }, epoch, true).length, 0);
  assert.equal(gate.take('s', { items: [{ id: 'old', at: epoch - 60000, tokens: 5 }] }, epoch).length, 0);
  assert.equal(gate.take('other', { items: [second] }, epoch).length, 0);
  gate.forget('s');
  assert.equal(gate.take('s', { items: [third] }, epoch).length, 0);
});

test('usage floats anchor to their session, remain bounded and clear on exit', async () => {
  const env = environment();
  const controller = logic.createController({ call: async () => ({ ok: true, value: status() }) }, env);
  controller.start(); await settle();
  const geometry = { isConnected: true, getBoundingClientRect: () => ({ left: 100, top: 200, bottom: 220, width: 60 }) };
  const detach = controller.attachUsageAnchor('s', geometry);
  controller.receiveUsage('s', { items: [] });
  controller.receiveUsage('s', { items: [{ id: 'a', at: epoch, tokens: 500 }] });
  const first = controller.getSnapshot().floaters;
  assert.equal(first.length, 1);
  assert.equal(first[0].x, 130); assert.equal(first[0].y, 196);
  assert.equal(first[0].text, '−500 tokens');
  controller.receiveUsage('other', { items: [] });
  controller.receiveUsage('other', { items: [{ id: 'elsewhere', at: epoch, tokens: 600 }] });
  assert.equal(controller.getSnapshot().floaters.length, 1);
  controller.receiveUsage('s', { items: Array.from({ length: 10 }, (_, n) => ({ id: 'new' + n, at: epoch, tokens: 100 + n })) });
  assert.equal(controller.getSnapshot().floaters.length, 4);
  controller.hidden(); assert.equal(controller.getSnapshot().floaters.length, 0);
  controller.wake(); await settle();
  controller.receiveUsage('s', { items: [] });
  controller.receiveUsage('s', { items: [{ id: 'b', at: epoch, tokens: 800 }] });
  assert.equal(controller.getSnapshot().floaters.length, 1);
  detach(); assert.equal(controller.getSnapshot().floaters.length, 0);
  controller.dispose(); assert.equal(env.timers.size, 0); assert.equal(env.intervals.size, 0);
});

test('usage floats expire even when animation-end is unavailable', async () => {
  const env = environment();
  const controller = logic.createController({ call: async () => ({ ok: true, value: status() }) }, env);
  controller.start(); await settle();
  controller.attachUsageAnchor('', { isConnected: true, getBoundingClientRect: () => ({ left: 100, top: 30, bottom: 50, width: 60 }) });
  controller.receiveUsage('s', { items: [] });
  controller.receiveUsage('s', { items: [{ id: 'a', at: epoch, tokens: 20 }] });
  assert.equal(controller.getSnapshot().floaters[0].rise, 54);
  env.advance(2700); env.fireDue();
  assert.equal(controller.getSnapshot().floaters.length, 1);
  assert.equal(controller.getSnapshot().floaters[0].duration, 3000);
  env.advance(700); env.fireDue();
  assert.equal(controller.getSnapshot().floaters.length, 0);
  controller.dispose();
});

test('custom float color and longer duration apply without changing badge colors', async () => {
  const env = environment();
  const cfg = { ...status().settings, peakColor: '#f5941b', valleyColor: '#3b6ef5', usageFloatFollowPeriod: false, usageFloatColor: '#ff66aa', usageFloatDuration: 5 };
  const controller = logic.createController({ call: async () => ({ ok: true, value: status({ settings: cfg }) }) }, env);
  controller.start(); await settle();
  controller.attachUsageAnchor('s', { isConnected: true, getBoundingClientRect: () => ({ left: 100, top: 200, bottom: 220, width: 60 }) });
  controller.receiveUsage('s', { items: [] });
  controller.receiveUsage('s', { items: [{ id: 'a', at: epoch, tokens: 20 }] });
  assert.equal(controller.getSnapshot().floaters[0].color, '#ff66aa');
  assert.equal(controller.getSnapshot().floaters[0].duration, 5000);
  assert.equal(controller.getSnapshot().status.settings.valleyColor, '#3b6ef5');
  env.advance(3000); env.fireDue();
  assert.equal(controller.getSnapshot().floaters.length, 1);
  env.advance(2400); env.fireDue();
  assert.equal(controller.getSnapshot().floaters.length, 0);
  assert.equal(logic.patchFromDraft({ usageFloatDuration: '5.5' }, { usageFloatDuration: true }, {}).usageFloatDuration, 5.5);
  assert.throws(() => logic.patchFromDraft({ usageFloatDuration: '9' }, { usageFloatDuration: true }, {}));
  controller.dispose();
});

test('native timer receivers survive controller startup, deadline scheduling and disposal', async () => {
  const base = environment();
  const seen = new Set();
  const native = {};
  for (const key of ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']) {
    native[key] = function (...args) {
      if (this !== native) throw new TypeError('Illegal invocation');
      seen.add(key);
      return base[key](...args);
    };
  }
  assert.throws(() => ({ setInterval: native.setInterval }).setInterval(() => {}, 1000), /Illegal invocation/);
  const controller = logic.createController({ call: async () => ({ ok: true, value: status() }) }, { ...base, ...logic.timerFacade(native) });
  controller.start();
  await settle();
  assert.equal(controller.getSnapshot().error, null);
  controller.dispose();
  assert.deepEqual([...seen].sort(), ['clearInterval', 'clearTimeout', 'setInterval', 'setTimeout']);
  assert.equal(base.intervals.size, 0);
  assert.equal(base.timers.size, 0);
});

test('countdown uses absolute epoch and monotonic server clock, never client wall time', () => {
  const anchor = { epoch, monotonic: 500 };
  const now = logic.serverTime(anchor, 1750);
  assert.equal(now, epoch + 1250);
  assert.equal(logic.secondsUntilSwitch(now, { epoch: epoch + 61_000 }), 60);
  assert.equal(logic.secondsUntilSwitch(epoch + 70_000, { epoch: epoch + 61_000 }), 0);
  assert.equal(logic.secondsUntilSwitch(now, { at: '02:00', tomorrow: true }), null);
  assert.equal(logic.serverTime(null, 100), null);
  assert.equal(logic.countdownText(3661), '1h01m');
  assert.equal(logic.countdownText(61), '1m01s');
  assert.equal(logic.countdownText(null), '—');
});

test('timeline proportions use actual DST day span and partial-hour epochs', () => {
  const start = Date.UTC(2026, 2, 8, 5);
  const value = logic.timelinePieces({ dayStart: start, dayEnd: start + 23 * 3600_000, segments: [
    { startEpoch: start, endEpoch: start + 30 * minute, period: 'peak' },
    { startEpoch: start + 30 * minute, endEpoch: start + 23 * 3600_000, period: 'off-peak' }
  ] });
  assert.equal(value.length, 2);
  assert.equal(value[0].width, 0.5 / 23 * 100);
  assert.equal(value[1].left, value[0].width);
  assert.equal(value[0].width + value[1].width, 100);
  assert.equal(logic.timelinePieces({ segments: [] }).length, 0);
  assert.equal(logic.currentOf({ segments: [{ period: 'peak' }] }).period, 'unknown');
});

test('reminders require a fresh visible crossing and are off by default', () => {
  const value = status();
  const trigger = value.nextSwitch.epoch - 10 * minute;
  assert.equal(logic.eligibleReminders(value, trigger - 1000, trigger)[0].type, 'before');
  assert.equal(logic.eligibleReminders(value, null, trigger).length, 0);
  assert.equal(logic.eligibleReminders(value, trigger - 61_000, trigger).length, 0);
  assert.equal(logic.eligibleReminders(value, trigger - 1000, trigger, { visible: false }).length, 0);
  assert.equal(logic.eligibleReminders(value, trigger - 1000, trigger, { gap: 61_000 }).length, 0);
  assert.equal(logic.eligibleReminders(value, trigger, trigger + 1000).length, 0);
  assert.equal(logic.eligibleReminders(status({ settings: {} }), trigger - 1000, trigger).length, 0);
  assert.equal(logic.eligibleReminders(status({ current: { period: 'unknown' } }), trigger - 1000, trigger).length, 0);
});

test('transition reminders distinguish peak/off-peak and never catch up expired before reminders', () => {
  for (const period of ['peak', 'off-peak']) {
    const value = status({ nextSwitch: { epoch: epoch + minute, period } });
    const result = logic.eligibleReminders(value, epoch + minute - 1, epoch + minute + 500);
    assert.equal(result.length, 1);
    assert.equal(result[0].type, 'on');
    assert.equal(result[0].period, period);
  }
  assert.equal(logic.eligibleReminders(status({ nextSwitch: null }), epoch, epoch + 1000).length, 0);
});

test('reminder ledger deduplicates by transition/type and expires bounded history', () => {
  const event = { epoch, period: 'peak', type: 'before' };
  const key = logic.reminderKey(event);
  const first = logic.claimReminder({ ancient: epoch - 4 * 86_400_000 }, key, epoch);
  assert.equal(first.claimed, true);
  assert.equal(first.ledger.ancient, undefined);
  assert.equal(logic.claimReminder(first.ledger, key, epoch + 1000).claimed, false);
  assert.equal(logic.claimReminder(first.ledger, logic.reminderKey({ ...event, type: 'on' }), epoch).claimed, true);
});

test('two windows coordinate reminder claims through shared storage and Web Locks', async () => {
  const env = environment();
  let queue = Promise.resolve();
  let locks = 0;
  env.locks = { request(_key, callback) { locks++; const work = queue.then(callback); queue = work.catch(() => {}); return work; } };
  const a = logic.createReminderGate(env);
  const b = logic.createReminderGate(env);
  const event = { epoch, period: 'peak', type: 'on' };
  assert.deepEqual(await Promise.all([a(event, epoch), b(event, epoch)]), [true, false]);
  assert.equal(locks, 2);
  const denied = logic.createReminderGate({ storage: { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } } });
  assert.equal(await denied(event, epoch), true);
  assert.equal(await denied(event, epoch), false);
});

test('settings patches leave untouched custom prices and rules intact', () => {
  const original = { peakLabel: 'P', priceMode: 'official', peakPrice: 9, valleyPrice: 4.5, peakWindows: [[22, 2]], reminders: { beforePeak: false, onValley: true, beforeMinutes: 10 } };
  const patch = logic.patchFromDraft({ ...original, peakLabel: 'New', peakPrice: 8 }, { peakLabel: true }, original);
  assert.deepEqual(plain(patch), { peakLabel: 'New' });
  assert.throws(() => logic.patchFromDraft({ peakPrice: '' }, { peakPrice: true }, original), /invalid/);
  const reminder = logic.patchFromDraft({ reminders: { beforeMinutes: '15' } }, { reminders: true }, original).reminders;
  assert.equal(reminder.beforeMinutes, 15);
  assert.equal(reminder.onValley, true);
  assert.throws(() => logic.patchFromDraft({ reminders: { beforeMinutes: 61 } }, { reminders: true }, original), /invalid/);
  assert.deepEqual(plain(logic.parseWindows('[[22,2],[6.5,7]]')), [[22, 2], [6.5, 7]]);
  assert.throws(() => logic.parseWindows('[[2,2]]'), /invalidWindows/);
  assert.throws(() => logic.parseWindows('[[1.001,2]]'), /invalidWindows/);
  assert.deepEqual(plain(logic.settingsOf({ labels: { peak: 'Old', valley: 'Low' }, flags: { showPrice: false }, peakPrice: 9 })), { peakPrice: 9, peakLabel: 'Old', valleyLabel: 'Low', showPrice: false });
});

test('one shared clock serves subscribers, adopts serverNow, and cleans every timer', async () => {
  const env = environment();
  let calls = 0;
  const controller = logic.createController({ call: async () => { calls++; return { ok: true, value: status() }; } }, env);
  const offA = controller.subscribe(() => {});
  const offB = controller.subscribe(() => {});
  controller.start();
  controller.start();
  await settle();
  assert.equal(calls, 1);
  assert.equal(env.intervals.size, 1);
  assert.equal(controller.getSnapshot().now, epoch);
  env.advance(1000);
  assert.equal(controller.getSnapshot().now, epoch + 1000);
  offA(); offB(); controller.dispose();
  assert.equal(env.intervals.size, 0);
  assert.equal(env.timers.size, 0);
});

test('ordered requests discard an old status when a save is queued and immediately publish the save', async () => {
  const env = environment();
  const first = deferred();
  const calls = [];
  const controller = logic.createController({ call: (method, payload) => {
    calls.push([method, payload]);
    return calls.length === 1 ? first.promise : Promise.resolve({ ok: true, value: status({ configVersion: 'b', settings: { position: 'off' } }) });
  } }, env);
  const reading = controller.refresh();
  await settle();
  const saving = controller.save({ position: 'off', _revision: 'a' });
  first.resolve({ ok: true, value: status() });
  await reading;
  await saving;
  assert.equal(calls[0][0], 'status');
  assert.equal(calls[0][1], null);
  assert.equal(calls[1][0], 'updateConfig');
  assert.equal(controller.getSnapshot().status.configVersion, 'b');
  assert.equal(controller.getSnapshot().status.settings.position, 'off');
  controller.dispose();
});

test('a rejected save reloads Host values without treating the draft as committed', async () => {
  const env = environment();
  const calls = [];
  const controller = logic.createController({ call: async (method) => {
    calls.push(method);
    return method === 'updateConfig' ? { ok: false, error: { message: 'revision conflict' } } : { ok: true, value: status({ configVersion: 'latest' }) };
  } }, env);
  await assert.rejects(controller.save({ _revision: 'old', position: 'off' }), /revision conflict/);
  await settle();
  assert.deepEqual(calls, ['updateConfig', 'status']);
  assert.equal(controller.getSnapshot().status.configVersion, 'latest');
  controller.dispose();
});

test('refreshPolicy duration is not added to its end-of-request serverNow', async () => {
  const env = environment();
  const pending = deferred();
  const controller = logic.createController({ call: () => pending.promise }, env);
  const request = controller.refreshPolicy();
  await settle();
  env.advance(20_000);
  pending.resolve({ ok: true, value: status({ serverNow: epoch + 20_000 }) });
  await request;
  assert.equal(controller.getSnapshot().now, epoch + 20_000);
  controller.dispose();
});

test('switch epoch triggers refresh and long browser sleep produces no catch-up reminder', async () => {
  const env = environment();
  let calls = 0;
  const initial = status({ nextSwitch: { epoch: epoch + 2000, period: 'peak' } });
  const controller = logic.createController({ call: async () => {
    calls++;
    return { ok: true, value: calls === 1 ? initial : status({ serverNow: epoch + 120_000, nextSwitch: null }) };
  } }, env);
  controller.start(); await settle();
  env.advance(1000);
  env.advance(120_000);
  env.fireDue();
  await settle();
  assert.equal(controller.getSnapshot().notice, null);
  assert.equal(calls, 2);
  controller.dispose();
});

test('normal foreground transition emits once; hiding or first load emits nothing', async () => {
  const env = environment();
  const value = status({ nextSwitch: { epoch: epoch + 2000, period: 'peak', label: 'P' } });
  const controller = logic.createController({ call: async () => ({ ok: true, value }) }, env);
  controller.start(); await settle();
  assert.equal(controller.getSnapshot().notice, null);
  env.advance(1000); env.advance(1000); await settle();
  assert.equal(controller.getSnapshot().notice.type, 'on');
  controller.dismissNotice(); env.advance(1000); await settle();
  assert.equal(controller.getSnapshot().notice, null);
  env.setVisible(false); controller.hidden(); env.advance(120_000); await settle();
  assert.equal(controller.getSnapshot().notice, null);
  controller.dispose();
});

test('the absolute switch timer refreshes without waiting for the five-minute poll', async () => {
  const env = environment();
  let calls = 0;
  const controller = logic.createController({ call: async () => {
    calls++;
    return { ok: true, value: status({ serverNow: epoch + (calls > 1 ? 2050 : 0), nextSwitch: calls > 1 ? null : { epoch: epoch + 2000, period: 'peak' } }) };
  } }, env);
  controller.start(); await settle();
  env.advance(1000);
  env.advance(1050);
  assert.equal(calls, 1);
  env.fireDue(); await settle();
  assert.equal(calls, 2);
  controller.dispose();
});

test('a reminder waiting on a cross-window lock cannot appear after hiding or unload', async () => {
  const env = environment();
  const lock = deferred();
  let callback;
  env.locks = { request(_key, claim) { callback = claim; return lock.promise.then(claim); } };
  const controller = logic.createController({ call: async () => ({ ok: true, value: status({ nextSwitch: { epoch: epoch + 2000, period: 'peak' } }) }) }, env);
  controller.start(); await settle();
  env.advance(1000); env.advance(1000);
  assert.equal(typeof callback, 'function');
  controller.hidden(); controller.wake();
  lock.resolve(); await settle();
  assert.equal(controller.getSnapshot().notice, null);
  controller.dispose();
  assert.equal(callback(), false);
});

test('late responses cannot republish after plugin disposal', async () => {
  const env = environment();
  const pending = deferred();
  const controller = logic.createController({ call: () => pending.promise }, env);
  const request = controller.refresh(); await settle();
  controller.dispose();
  pending.resolve({ ok: true, value: status() }); await request;
  assert.equal(controller.getSnapshot().status, null);
  assert.equal(env.timers.size, 0);
});
