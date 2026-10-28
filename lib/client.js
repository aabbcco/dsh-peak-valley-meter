// Browser half: plain ModuleLoader factory; all resources belong to apply().
window.__ModuleLoader__.load({
  id: 'dsh-peak-valley-meter',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    const NS = 'peakValleyMeter';
    const MINUTE = 60_000;
    const DAY = 86_400_000;
    const OFF_REMINDERS = { beforeMinutes: 10, beforePeak: false, beforeValley: false, onPeak: false, onValley: false };
    const dictionaries = {
      en: {
        title: 'Peak & Valley Meter', loading: 'Loading tariff…', unknown: 'Unknown', peak: 'Peak', valley: 'Off-peak',
        until: '{label} in {time}', noSwitch: 'No confirmed next switch', syncing: 'Updating tariff…',
        details: 'Price details', close: 'Close', timeline: 'Today’s tariff timeline', timezone: 'Display time zone',
        next: 'Next switch', current: 'Current period', price: 'Current price', settings: 'Settings',
        source: 'Price source', official: 'Official', custom: 'Custom', model: 'Model', priceKind: 'Price category',
        cacheHit: 'Input · cache hit', cacheMiss: 'Input · cache miss', output: 'Output',
        prices: 'Official reference · CNY / million tokens', policy: 'Policy status', builtin: 'Bundled policy', cached: 'Cached policy',
        checked: 'Last checked', success: 'Last successful update', calendar: 'Holiday calendar valid through',
        billingDate: 'Billing date (Asia/Shanghai)', sourceLink: 'Official source', refresh: 'Check official policy', refreshing: 'Checking…',
        retry: 'Retry', save: 'Save', saving: 'Saving…', saved: 'Saved', reset: 'Discard edits',
        failure: 'Request failed', unavailable: 'Connection unavailable', stale: 'Showing the last received tariff; reconnecting.',
        display: 'Display', peakLabel: 'Peak label', valleyLabel: 'Off-peak label', peakColor: 'Peak color', valleyColor: 'Off-peak color',
        position: 'Position', sidebar: 'Sidebar footer', dock: 'Below composer', header: 'Conversation header',
        'input-left': 'Composer toolbar · left', 'input-right': 'Composer toolbar · right', off: 'Hidden',
        showCountdown: 'Countdown', showPrice: 'Price', showBar: 'Timeline', showClock: 'Clock',
        usageEffect: 'Usage floating text', showUsageFloat: 'Show after each model call', usageFloatUnit: 'Display unit', tokens: 'Tokens', cny: 'CNY estimate',
        previewEffect: 'Preview effect', previewHelp: 'Sample only · uses unsaved choices · no model call or charge',
        usageFloatColor: 'Floating text color', usageFloatFollowPeriod: 'Follow peak / off-peak color', usageFloatDuration: 'Duration (seconds)',
        invalidFloatDuration: 'Duration must be between 1 and 8 seconds.',
        usageEffectHelp: 'Slowly floats upward, grows and fades out. Larger duration means slower animation. Choosing a color switches to an independent text color. CNY uses bundled official reference prices; unsupported models fall back to tokens. Hidden pages and history are not replayed.',
        priceMode: 'Price mode', peakPrice: 'Custom peak price', valleyPrice: 'Custom off-peak price', currency: 'Currency', priceUnit: 'Price unit',
        ruleMode: 'Schedule mode', rules: 'Schedule', peakWindows: 'Peak windows (UTC hours)',
        windowsHelp: 'JSON hour pairs, for example [[1,4],[6,10]]. Fractions represent partial hours.',
        weekendAllValley: 'All off-peak on weekends', holidaysAllValley: 'All off-peak on official holidays',
        autoUpdate: 'Automatically check official policy', customHelp: 'Custom rules and prices are estimates you maintain.',
        reminders: 'In-app reminders', reminderHelp: 'Off by default. Shown only while this page is visible. No catch-up after sleep; no system notifications.',
        beforeMinutes: 'Minutes before switch', beforePeak: 'Before peak starts', beforeValley: 'Before off-peak starts',
        onPeak: 'When peak starts', onValley: 'When off-peak starts', beforeNotice: '{label} starts in {minutes} min',
        onNotice: '{label} has started', invalid: 'Check the entered values before saving.',
        invalidWindows: 'Use up to 6 UTC hour pairs at whole-minute precision, with different endpoints. A start after the end wraps midnight.',
        changed: 'Settings changed elsewhere. Your draft is retained; discard edits to load the latest version.',
        settingsUnavailable: 'Settings cannot be saved right now. Reconnect or reload this page and try again.',
        savedRefreshFailed: 'The change was sent, but its latest state could not be confirmed. Reload before saving again.',
        summary: 'Tariff display, official/custom pricing, schedule, and optional in-app reminders.',
        notAvailable: 'Not available', never: 'Not checked yet', policyVersion: 'Policy version',
        transitionPending: 'Confirming the new period…', dismissReminder: 'Dismiss reminder', weekend: 'Weekend off-peak policy', holiday: 'Official holiday off-peak policy', window: 'Scheduled peak window', 'off-hours': 'Outside peak windows', 'calendar-unknown': 'The holiday calendar does not cover this date.'
      },
      zh: {
        title: '峰谷时计', loading: '峰谷时计加载中…', unknown: '未知', peak: '峰时', valley: '谷时',
        until: '距{label} {time}', noSwitch: '暂无已确认的下次切换', syncing: '正在更新时段…',
        details: '价格详情', close: '关闭', timeline: '今日峰谷时间轴', timezone: '显示时区',
        next: '下次切换', current: '当前时段', price: '当前价格', settings: '设置',
        source: '价格来源', official: '官方', custom: '自定义', model: '模型', priceKind: '价格类型',
        cacheHit: '输入 · 缓存命中', cacheMiss: '输入 · 缓存未命中', output: '输出',
        prices: '官方参考价 · 人民币/百万 tokens', policy: '政策状态', builtin: '内置政策', cached: '缓存政策',
        checked: '上次检查', success: '上次成功更新', calendar: '节假日日历有效期',
        billingDate: '计费日期（北京时间）', sourceLink: '官方来源', refresh: '检查官方政策', refreshing: '检查中…',
        retry: '重试', save: '保存', saving: '保存中…', saved: '已保存', reset: '放弃修改',
        failure: '请求失败', unavailable: '连接不可用', stale: '正在显示上次收到的时段，等待重新连接。',
        display: '显示', peakLabel: '峰时显示名称', valleyLabel: '谷时显示名称', peakColor: '峰色', valleyColor: '谷色',
        position: '显示位置', sidebar: '侧边栏底部', dock: '输入框下方', header: '顶部栏右侧',
        'input-left': '输入框工具行左侧', 'input-right': '输入框工具行右侧', off: '关闭显示',
        showCountdown: '倒计时', showPrice: '价格', showBar: '时间轴', showClock: '时钟',
        usageEffect: '调用消耗飘字', showUsageFloat: '每次模型调用后显示', usageFloatUnit: '显示单位', tokens: 'Token 用量', cny: '人民币估算',
        previewEffect: '预览特效', previewHelp: '使用当前未保存设置的示例 · 不调用模型、不产生扣费',
        usageFloatColor: '飘字颜色', usageFloatFollowPeriod: '跟随峰谷颜色', usageFloatDuration: '动画时长（秒）',
        invalidFloatDuration: '飘动时长须为 1–8 秒。',
        usageEffectHelp: '缓慢上飘、放大并淡出，时长越大动画越慢。选择颜色后自动改用独立飘字颜色，不影响峰谷标签。金额按内置官方价估算；不支持的模型显示 token。不会补播历史或后台消耗。',
        priceMode: '价格模式', peakPrice: '自定义峰档价格', valleyPrice: '自定义谷档价格', currency: '币种', priceUnit: '价格单位',
        ruleMode: '时段模式', rules: '时段规则', peakWindows: '峰时窗口（UTC 小时）',
        windowsHelp: '填写 JSON 小时对，例如 [[1,4],[6,10]]；小数表示不足整小时。',
        weekendAllValley: '周末全天谷价', holidaysAllValley: '官方节假日全天谷价',
        autoUpdate: '自动检查官方政策', customHelp: '自定义时段与价格由你维护，仅供估算。',
        reminders: '应用内提醒', reminderHelp: '默认全部关闭。仅页面可见时提醒；休眠后不补发，不发送系统通知。',
        beforeMinutes: '提前分钟数', beforePeak: '峰时开始前', beforeValley: '谷时开始前',
        onPeak: '峰时开始时', onValley: '谷时开始时', beforeNotice: '{label}将在 {minutes} 分钟后开始',
        onNotice: '{label}已开始', invalid: '请检查填写内容后再保存。',
        invalidWindows: '最多填写 6 个 UTC 小时对，精确到分钟且起止不相同；起点大于终点表示跨日。',
        changed: '设置已在其他位置更新。草稿已保留；放弃修改可载入最新版本。',
        settingsUnavailable: '当前设置暂时无法保存，请重新连接或刷新页面后重试。',
        savedRefreshFailed: '修改已提交，但尚未确认最新状态。请重新载入设置后再保存。',
        summary: '峰谷显示、官方或自定义价格、时段规则及可选应用内提醒。',
        notAvailable: '暂无数据', never: '尚未检查', policyVersion: '政策版本',
        transitionPending: '正在确认新时段…', dismissReminder: '关闭提醒', weekend: '周末谷价规则', holiday: '官方节假日谷价规则', window: '处于峰时窗口', 'off-hours': '处于峰时窗口之外', 'calendar-unknown': '节假日日历尚未覆盖该日期。'
      }
    };

    function settingsOf(status) {
      if (status?.settings) return status.settings;
      if (!status) return {};
      const result = {};
      for (const key of ['timezone', 'position', 'peakColor', 'valleyColor', 'peakPrice', 'valleyPrice', 'currency', 'priceUnit']) {
        if (status[key] !== undefined) result[key] = status[key];
      }
      if (status.labels?.peak !== undefined) result.peakLabel = status.labels.peak;
      if (status.labels?.valley !== undefined) result.valleyLabel = status.labels.valley;
      Object.assign(result, status.flags || {});
      return result;
    }
    function settingsBinding(status) {
      const ns = status?.configNamespace;
      const version = status?.configVersion;
      if (typeof ns !== 'string' || !ns.trim() || typeof version !== 'string' || !/^(0|[1-9]\d*)$/.test(version)) return null;
      const revision = Number(version);
      return Number.isSafeInteger(revision) ? { ns, revision } : null;
    }
    function canSaveSettings(status) {
      return status?.configWritable === true && status.settings !== null && typeof status.settings === 'object'
        && !Array.isArray(status.settings) && Boolean(settingsBinding(status));
    }
    function rpcValue(result) {
      if (result?.ok === true) return result.value;
      const error = new Error(result?.error?.code === 'settings/conflict' ? 'changed' : result?.error?.message || 'failure');
      error.code = result?.error?.code;
      throw error;
    }
    function createApi(connection) {
      return {
        call: (method, payload) => connection.rpc.call('/api', 'peak-valley-price/' + method, payload ?? null),
        mutateSettings: async (ns, ops, expectedRevision) => rpcValue(await connection.rpc.call('/api', 'settings/mutate', { args: { ns, ops, expectedRevision } })),
      };
    }
    // No local tariff classifier: periods and absolute transitions come from Host.
    function currentOf(status) {
      const current = status?.current;
      return current && ['peak', 'off-peak', 'unknown'].includes(current.period) ? current : { period: 'unknown' };
    }
    function serverTime(anchor, monotonicNow) {
      return anchor ? anchor.epoch + Math.max(0, monotonicNow - anchor.monotonic) : null;
    }
    function secondsUntilSwitch(now, next) {
      return Number.isFinite(now) && Number.isFinite(next?.epoch) ? Math.max(0, Math.ceil((next.epoch - now) / 1000)) : null;
    }
    function countdownText(seconds) {
      if (!Number.isFinite(seconds)) return '—';
      seconds = Math.max(0, Math.ceil(seconds));
      if (seconds >= 3600) return Math.floor(seconds / 3600) + 'h' + String(Math.floor(seconds % 3600 / 60)).padStart(2, '0') + 'm';
      if (seconds >= 60) return Math.floor(seconds / 60) + 'm' + String(seconds % 60).padStart(2, '0') + 's';
      return seconds + 's';
    }
    function timelinePieces(status) {
      const start = status?.dayStart;
      const end = status?.dayEnd;
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
      return (status.segments || []).flatMap((segment) => {
        if (!Number.isFinite(segment.startEpoch) || !Number.isFinite(segment.endEpoch)) return [];
        const a = Math.max(start, segment.startEpoch);
        const b = Math.min(end, segment.endEpoch);
        return b > a ? [{ ...segment, left: (a - start) / (end - start) * 100, width: (b - a) / (end - start) * 100 }] : [];
      });
    }
    function parseWindows(raw) {
      const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(value) || value.length > 6) throw new Error('invalidWindows');
      return value.map((pair) => {
        if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isFinite)
          || pair[0] < 0 || pair[0] >= 24 || pair[1] < 0 || pair[1] > 24 || pair[0] === pair[1]
          || pair.some((hour) => Math.abs(hour * 60 - Math.round(hour * 60)) > 1e-8)) throw new Error('invalidWindows');
        return [...pair];
      });
    }
    function patchFromDraft(draft, touched, original) {
      const patch = {};
      for (const key of Object.keys(touched)) {
        let value = draft[key];
        if (key === 'peakWindows') {
          try { value = parseWindows(value); } catch { throw new Error('invalidWindows'); }
        }
        if (key === 'usageFloatDuration') {
          value = Number(value);
          if (!Number.isFinite(value) || value < 1 || value > 8) throw new Error('invalidFloatDuration');
        }
        if (['peakPrice', 'valleyPrice'].includes(key)) {
          if (String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error('invalid');
          value = Number(value);
        }
        if (key === 'reminders') {
          const previous = { ...OFF_REMINDERS, ...original.reminders };
          value = { ...previous, ...value };
          if (String(value.beforeMinutes).trim() === '' || !Number.isInteger(Number(value.beforeMinutes)) || Number(value.beforeMinutes) < 1 || Number(value.beforeMinutes) > 60) throw new Error('invalid');
          value.beforeMinutes = Number(value.beforeMinutes);
          const changed = Object.fromEntries(Object.entries(value).filter(([field, entry]) => JSON.stringify(entry) !== JSON.stringify(previous[field])));
          if (Object.keys(changed).length) patch[key] = changed;
          continue;
        }
        if (JSON.stringify(value) !== JSON.stringify(original[key])) patch[key] = value;
      }
      return patch;
    }
    // Crossings only: never notify at first load, after suspension, or for unknown periods.
    function eligibleReminders(status, previousNow, now, { visible = true, gap = 0 } = {}) {
      if (!visible || gap > MINUTE || !Number.isFinite(previousNow) || !Number.isFinite(now) || now <= previousNow || now - previousNow > MINUTE) return [];
      const next = status?.nextSwitch;
      if (!Number.isFinite(next?.epoch) || !['peak', 'off-peak'].includes(next.period) || currentOf(status).period === 'unknown') return [];
      const cfg = { ...OFF_REMINDERS, ...settingsOf(status).reminders };
      const suffix = next.period === 'peak' ? 'Peak' : 'Valley';
      const events = [];
      const before = next.epoch - Number(cfg.beforeMinutes) * MINUTE;
      if (cfg['before' + suffix] && previousNow < before && now >= before && now < next.epoch) events.push({ type: 'before', epoch: next.epoch, period: next.period, minutes: Math.max(1, Math.ceil((next.epoch - now) / MINUTE)), label: next.label });
      if (cfg['on' + suffix] && previousNow < next.epoch && now >= next.epoch) events.push({ type: 'on', epoch: next.epoch, period: next.period, label: next.label });
      return events;
    }
    function reminderKey(event) { return event.epoch + ':' + event.period + ':' + event.type; }
    function claimReminder(ledger, key, now) {
      const next = {};
      for (const [id, timestamp] of Object.entries(ledger || {})) if (Number.isFinite(timestamp) && now - timestamp < 3 * DAY && timestamp <= now + DAY) next[id] = timestamp;
      if (Object.hasOwn(next, key)) return { claimed: false, ledger: next };
      next[key] = now;
      return { claimed: true, ledger: Object.fromEntries(Object.entries(next).slice(-100)) };
    }
    function createReminderGate(env, active = () => true) {
      let memory = {};
      const storageKey = 'dsh-peak-valley-price:reminders:v1';
      return async (event, now) => {
        const claim = () => {
          if (!active()) return false;
          let saved = {};
          try { saved = JSON.parse(env.storage?.getItem(storageKey) || '{}'); } catch { /* Storage may be denied. */ }
          const result = claimReminder({ ...saved, ...memory }, reminderKey(event), now);
          memory = result.ledger;
          try { env.storage?.setItem(storageKey, JSON.stringify(memory)); } catch { /* Per-window dedup still works. */ }
          return result.claimed;
        };
        if (env.locks?.request) {
          try { return await env.locks.request(storageKey, claim); } catch { /* Best effort without Web Locks. */ }
        }
        return claim();
      };
    }

    function usageFloatAppearance(cfg, period) {
      const seconds = Number(cfg.usageFloatDuration ?? 3);
      if (!Number.isFinite(seconds) || seconds < 1 || seconds > 8) throw new Error('invalidFloatDuration');
      return { duration: seconds * 1000,
        color: cfg.usageFloatFollowPeriod === false ? (cfg.usageFloatColor || '#3b6ef5') : periodColor(period, cfg) };
    }
    function usagePreviewSample(cfg, period) {
      return { ...usageFloatAppearance(cfg, period), text: usageFloatText({ tokens: 1234, costCny: .0123 }, cfg.usageFloatUnit || 'tokens') };
    }
    function usageFloatText(item, unit) {
      if (!Number.isSafeInteger(item?.tokens) || item.tokens <= 0) return null;
      if (unit === 'cny' && Number.isFinite(item.costCny) && item.costCny > 0) {
        const amount = item.costCny < 0.000001 ? item.costCny.toExponential(2)
          : Number(item.costCny.toFixed(6)).toString();
        return '≈−' + amount + ' 元';
      }
      return '−' + item.tokens.toLocaleString('en-US') + ' tokens';
    }
    function createUsageGate() {
      const cursors = new Map();
      return {
        take(sessionId, value, now, allowed = true) {
          if (!sessionId || !Array.isArray(value?.items)) return [];
          const items = value.items.slice(-12);
          const previous = cursors.get(sessionId);
          const seen = new Set([...(previous || []), ...items.map(item => item.id)]);
          cursors.delete(sessionId);
          cursors.set(sessionId, [...seen].slice(-64));
          while (cursors.size > 20) cursors.delete(cursors.keys().next().value);
          if (!previous || !allowed || !Number.isFinite(now)) return [];
          return items.filter(item => !previous.includes(item.id) && Number.isFinite(item.at)
            && now - item.at >= -2000 && now - item.at <= 15_000);
        },
        forget(sessionId) { cursors.delete(sessionId); },
        reset() { cursors.clear(); }
      };
    }
    function timerFacade(host) {
      return {
        setTimeout: (...args) => host.setTimeout(...args),
        clearTimeout: (...args) => host.clearTimeout(...args),
        setInterval: (...args) => host.setInterval(...args),
        clearInterval: (...args) => host.clearInterval(...args)
      };
    }
    // One store, ordered RPC queue, and clock per plugin fiber, shared by all surfaces.
    function createController(api, env) {
      let state = { status: null, now: null, error: null, panel: null, notice: null, busy: null, floaters: [], usageEpoch: 0 };
      const usageGate = createUsageGate();
      const usageAnchors = new Map();
      let floatSerial = 0;
      let usageReported = false;
      let floatTimer = null;
      const listeners = new Set();
      let disposed = false;
      let anchor = null;
      let queue = Promise.resolve();
      let pendingRead = null;
      let writeGeneration = 0;
      let timer = null;
      let switchTimer = null;
      let hideTimer = null;
      let noticeTimer = null;
      let previousNow = null;
      let previousWall = env.wall();
      let previousMono = env.monotonic();
      let lastReadWall = -Infinity;
      let suppress = true;
      let dismissedAnchor = null;
      let activityGeneration = 0;
      const claim = createReminderGate(env, () => !disposed);
      const publish = (patch) => {
        if (disposed) return;
        state = { ...state, ...patch };
        for (const listener of listeners) listener();
      };
      const now = () => serverTime(anchor, env.monotonic());
      const visible = () => env.visible();
      const checkReminders = (time, gap = 0) => {
        const candidates = eligibleReminders(state.status, suppress ? null : previousNow, time, { visible: visible(), gap });
        previousNow = time;
        suppress = false;
        for (const event of candidates) {
          const generation = writeGeneration;
          const activity = activityGeneration;
          const beganWall = env.wall();
          claim(event, time).then((claimed) => {
            if (!claimed || disposed || !visible() || generation !== writeGeneration || activity !== activityGeneration || env.wall() - beganWall > MINUTE || Math.abs(now() - time) > MINUTE) return;
            publish({ notice: event });
            env.clearTimeout(noticeTimer);
            noticeTimer = env.setTimeout(() => publish({ notice: null }), 15_000);
          }).catch(() => {});
        }
      };
      const scheduleSwitch = () => {
        env.clearTimeout(switchTimer);
        const epoch = state.status?.nextSwitch?.epoch;
        if (!Number.isFinite(epoch) || !Number.isFinite(now())) return;
        const delay = epoch - now();
        // A stale Host response must not create an immediate request loop.
        switchTimer = env.setTimeout(() => { tick(); refresh(); }, Math.min(2_147_000_000, Math.max(1000, delay + 50)));
      };
      const accept = (status, began, method) => {
        if (!status || typeof status !== 'object' || Array.isArray(status)) throw new Error('failure');
        const received = env.monotonic();
        const oldNow = now();
        if (method !== 'save') checkReminders(oldNow);
        if (Number.isFinite(status.serverNow)) anchor = { epoch: status.serverNow, monotonic: received };
        else anchor = null;
        const configChanged = state.status?.configVersion !== status.configVersion || state.status?.configNamespace !== status.configNamespace;
        if (configChanged || method === 'save') { suppress = true; previousNow = null; controller.resetUsage(); }
        publish({ status, now: now(), error: null });
        scheduleSwitch();
      };
      const request = (method, payload = null, binding = null) => {
        const generation = method === 'save' ? ++writeGeneration : writeGeneration;
        const work = async () => {
          if (disposed) throw new Error('unavailable');
          const began = env.monotonic();
          if (method !== 'status') publish({ busy: method });
          let committed = false;
          try {
            if (method === 'save') {
              const current = settingsBinding(state.status);
              const expected = settingsBinding(binding);
              if (!canSaveSettings(state.status) || !expected || typeof api.mutateSettings !== 'function') throw new Error('settingsUnavailable');
              if (expected.ns !== current.ns || expected.revision !== current.revision) throw new Error('changed');
              const ops = Object.entries(payload).flatMap(([key, value]) => key === 'reminders'
                ? Object.entries(value).map(([field, entry]) => ({ op: 'set', path: [key, field], value: entry }))
                : [{ op: 'set', path: [key], value }]);
              await api.mutateSettings(expected.ns, ops, expected.revision);
              committed = true;
              // The native result is a descriptor. Only a fresh status can update the tariff clock.
              if (disposed) throw new Error('unavailable');
            }
            const value = rpcValue(await api.call(method === 'save' ? 'status' : method, method === 'save' ? null : payload));
            if (!disposed && (method === 'save' || generation === writeGeneration)) accept(value, began, method);
            return value;
          } catch (failure) {
            const error = committed ? new Error('savedRefreshFailed') : failure;
            if (!disposed && generation === writeGeneration) publish({ error: error.message || 'unavailable' });
            throw error;
          } finally {
            if (method !== 'status') publish({ busy: null });
          }
        };
        const result = queue.then(work);
        queue = result.catch(() => {});
        return result;
      };
      function refresh() {
        if (disposed) return Promise.resolve(null);
        if (pendingRead) return pendingRead;
        lastReadWall = env.wall();
        pendingRead = request('status').catch(() => null).finally(() => { pendingRead = null; });
        return pendingRead;
      }
      function tick() {
        if (disposed) return;
        const wall = env.wall();
        const mono = env.monotonic();
        const wallGap = wall - previousWall;
        const monoGap = mono - previousMono;
        const suspended = wallGap > MINUTE || monoGap > MINUTE || Math.abs(wallGap - monoGap) > 5000;
        previousWall = wall;
        previousMono = mono;
        if (suspended || !visible()) { activityGeneration++; suppress = true; previousNow = null; if (suspended) controller.resetUsage(); }
        else checkReminders(now(), wallGap);
        publish({ now: now() });
        if (visible() && (suspended || wall - lastReadWall >= (state.error ? 30_000 : 300_000))) refresh();
      }
      const controller = {
        refreshUsage(sessionId) { Promise.resolve(env.refreshUsage?.(sessionId)).catch(() => {}); },
        resetUsage() {
          usageGate.reset();
          env.clearTimeout(floatTimer);
          publish({ floaters: [], usageEpoch: state.usageEpoch + 1 });
        },
        attachUsageAnchor(sessionId, element) {
          const key = sessionId || '';
          const elements = usageAnchors.get(key) || new Set();
          elements.add(element); usageAnchors.set(key, elements);
          return () => {
            elements.delete(element);
            if (!elements.size) usageAnchors.delete(key);
            publish({ floaters: state.floaters.filter(item => item.anchor !== element) });
          };
        },
        leaveUsageSession(sessionId) {
          usageGate.forget(sessionId);
          publish({ floaters: state.floaters.filter(item => item.sessionId !== sessionId) });
        },
        receiveUsage(sessionId, projection) {
          const cfg = settingsOf(state.status);
          const time = now();
          const allowed = !disposed && visible() && Boolean(state.status) && cfg.showUsageFloat !== false && cfg.position !== 'off';
          const items = usageGate.take(sessionId, projection, time, allowed);
          if (!items.length) return;
          const element = [...(usageAnchors.get(sessionId) || []), ...(usageAnchors.get('') || [])]
            .find(item => item?.isConnected && item.getBoundingClientRect().width > 0);
          if (!element) return;
          const rect = element.getBoundingClientRect();
          if (rect.bottom <= 0 || (env.viewportHeight && rect.top >= env.viewportHeight())) return;
          const { duration, color } = usageFloatAppearance(cfg, currentOf(state.status).period);
          const fresh = items.slice(-4).flatMap((item, index) => {
            const text = usageFloatText(item, cfg.usageFloatUnit || 'tokens');
            if (!text) return [];
            const serial = ++floatSerial;
            return [{ id: 'usage-' + serial, sessionId, anchor: element, text,
              x: Math.max(80, Math.min(rect.left + rect.width / 2, (env.viewportWidth?.() || 10000) - 80)),
              y: rect.top < 80 ? rect.bottom + 8 : rect.top - 4,
              rise: rect.top < 80 ? 54 : -58, drift: (serial % 3 - 1) * 13,
              delay: index * 140, duration, color }];
          });
          if (!fresh.length) return;
          publish({ floaters: [...state.floaters, ...fresh].slice(-4) });
          if (!usageReported) { usageReported = true; env.onUsage?.(fresh[0].text); }
          env.clearTimeout(floatTimer);
          floatTimer = env.setTimeout(() => publish({ floaters: [] }), duration + (fresh.length - 1) * 140 + 300);
        },
        dismissFloat(id) { publish({ floaters: state.floaters.filter(item => item.id !== id) }); },
        subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
        getSnapshot: () => state,
        refresh,
        save: (patch, binding) => request('save', patch, binding).catch((error) => { refresh(); throw error; }),
        invalidateSettings(ns) {
          if (ns !== state.status?.configNamespace || disposed) return;
          if (pendingRead) pendingRead.then(() => refresh());
          else refresh();
        },
        refreshPolicy: () => request('refreshPolicy'),
        start() { if (timer === null && !disposed) { refresh(); timer = env.setInterval(tick, 1000); } },
        wake() { activityGeneration++; suppress = true; previousNow = null; previousWall = env.wall(); previousMono = env.monotonic(); controller.resetUsage(); if (visible()) refresh(); },
        hidden() { activityGeneration++; suppress = true; previousNow = null; controller.resetUsage(); publish({ notice: null }); controller.close(false); },
        show(anchorElement, pinned = false) {
          env.clearTimeout(hideTimer);
          if (!pinned && (state.panel?.pinned || dismissedAnchor === anchorElement)) return;
          if (pinned && state.panel?.pinned && state.panel.anchor === anchorElement) { controller.close(true); return; }
          dismissedAnchor = null;
          publish({ panel: { anchor: anchorElement, pinned } });
        },
        leave(element) { if (dismissedAnchor === element) dismissedAnchor = null; if (!state.panel?.pinned) { env.clearTimeout(hideTimer); hideTimer = env.setTimeout(() => publish({ panel: null }), 180); } },
        keep() { env.clearTimeout(hideTimer); },
        close(restoreFocus = false) {
          const element = state.panel?.anchor;
          dismissedAnchor = element;
          env.clearTimeout(hideTimer);
          publish({ panel: null });
          if (restoreFocus && element?.isConnected) element.focus();
        },
        dismissNotice() { publish({ notice: null }); },
        dispose() {
          disposed = true;
          env.clearInterval(timer);
          for (const id of [switchTimer, hideTimer, noticeTimer, floatTimer]) env.clearTimeout(id);
          usageGate.reset(); usageAnchors.clear();
          listeners.clear();
        }
      };
      return controller;
    }

    const css = `
@keyframes pvp-usage-float{from{transform:translate3d(-50%,0,0) scale(.9)}to{transform:translate3d(-50%,-58px,0) scale(1.6)}}
@keyframes pvp-usage-fade{0%{opacity:0}10%,40%{opacity:1}100%{opacity:0}}
.pvp-usage-float{position:fixed;z-index:60;pointer-events:none;user-select:none;white-space:nowrap;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.4;opacity:0;backface-visibility:hidden;animation:pvp-usage-float var(--pvp-duration,3000ms) linear both,pvp-usage-fade var(--pvp-duration,3000ms) linear both;will-change:transform,opacity}
@media(prefers-reduced-motion:reduce){.pvp-usage-float{animation:pvp-usage-fade var(--pvp-duration,3000ms) linear both;transform:translate3d(-50%,0,0);will-change:opacity}}
.pvp-preview{margin-top:12px}.pvp-preview-stage{position:relative;height:120px;margin-top:8px;border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden;isolation:isolate}.pvp-preview-label{position:absolute;left:50%;top:94px;transform:translateX(-50%);font-size:12px;white-space:nowrap}
.pvp-badge-button{display:inline-flex;align-items:center;gap:7px;max-width:100%;padding:2px 5px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1.6;cursor:pointer;flex-wrap:wrap;text-align:left}
.pvp-badge-button:hover{background:var(--dsw-alias-bg-layer-2)}
.pvp-pill{font-weight:600;white-space:nowrap}.pvp-muted{color:var(--dsw-alias-label-secondary);font-size:12px}.pvp-small{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.pvp-countdown{font-variant-numeric:tabular-nums;white-space:nowrap}.pvp-badge-wrap{max-width:100%;min-width:0}.pvp-badge-wrap>div>.pvp-timeline{margin:4px 5px;width:160px;max-width:90%}
.pvp-surface{box-sizing:border-box;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;font:inherit;font-size:13px;line-height:1.5}
.pvp-popover{position:fixed;pointer-events:auto;padding:14px;overflow:auto;z-index:40;overscroll-behavior:contain}.pvp-popover>*+*{margin-top:12px}
.pvp-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;font-weight:600}.pvp-heading button{flex-shrink:0}
.pvp-button{font:inherit;font-size:12px;line-height:1.5;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);padding:5px 10px;cursor:pointer}.pvp-button:hover{background:var(--dsw-alias-bg-layer-3)}.pvp-button:disabled{opacity:.5;cursor:default}
.pvp-badge-button:focus-visible,.pvp-button:focus-visible,.pvp-input:focus-visible,.pvp-popover a:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.pvp-timeline{position:relative;height:10px;border-radius:4px;background:var(--dsw-alias-bg-layer-3);overflow:hidden}.pvp-segment{position:absolute;top:0;bottom:0}.pvp-now{position:absolute;top:0;bottom:0;width:2px;background:var(--dsw-alias-label-primary)}
.pvp-legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:6px;font-size:11px}.pvp-dot{display:inline-block;width:7px;height:7px;border-radius:50%;corner-shape:round;margin-right:4px}
.pvp-list{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 12px;margin:0}.pvp-list dt{color:var(--dsw-alias-label-secondary)}.pvp-list dd{margin:0;text-align:right;overflow-wrap:anywhere}.pvp-warning{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-primary));font-size:12px;overflow-wrap:anywhere}
.pvp-table{border-collapse:collapse;width:100%;font-size:12px;font-variant-numeric:tabular-nums}.pvp-table th,.pvp-table td{padding:5px 3px;text-align:right;border-bottom:1px solid var(--dsw-alias-border-l2)}.pvp-table th:first-child,.pvp-table td:first-child{text-align:left}.pvp-table caption{text-align:left;margin-bottom:5px}
.pvp-policy{border-top:1px solid var(--dsw-alias-border-l2);padding-top:10px}.pvp-policy summary{cursor:pointer}.pvp-policy dl{margin-top:8px}.pvp-link{color:var(--dsw-alias-state-business-primary)}
.pvp-form{display:flex;flex-direction:column;gap:16px;min-width:0;color:var(--dsw-alias-label-primary);font-size:13px}.pvp-form fieldset{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px;margin:0;min-width:0}.pvp-form legend{padding:0 5px;font-weight:600}.pvp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.pvp-field{display:flex;flex-direction:column;gap:5px;min-width:0}.pvp-input{box-sizing:border-box;width:100%;min-width:0;padding:6px 9px;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:7px}.pvp-input:disabled{opacity:.6}.pvp-input[type=color]{height:32px;padding:3px}.pvp-check{display:flex;align-items:center;gap:7px;font-size:12px}.pvp-check input{accent-color:var(--dsw-alias-state-business-primary)}.pvp-checks{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px}.pvp-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.pvp-note{margin:8px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px}
.pvp-notice{position:fixed;right:16px;bottom:20px;z-index:45;pointer-events:auto;max-width:calc(100vw - 32px);padding:12px 14px;display:flex;gap:12px;align-items:center;background:var(--dsw-alias-toast-bg,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-toast-label,var(--dsw-alias-label-primary))}
`;
    function useSnapshot(controller) { return React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot); }
    function useTranslation(locale) {
      React.useSyncExternalStore(React.useCallback((fn) => locale ? locale.subscribe(fn) : () => {}, [locale]), React.useCallback(() => locale?.getSnapshot() || 'en', [locale]));
      return locale ? locale.bind(NS) : (key, values) => (dictionaries.en[key] || key).replace(/\{(\w+)\}/g, (all, name) => values?.[name] ?? all);
    }
    const Style = React.memo(function Style() { return h('style', { 'data-plugin-css': 'dsh-peak-valley-meter' }, css); });
    function periodLabel(period, cfg, t) { return period === 'peak' ? cfg.peakLabel || t('peak') : period === 'off-peak' ? cfg.valleyLabel || t('valley') : t('unknown'); }
    function periodColor(period, cfg) { return period === 'peak' ? cfg.peakColor : period === 'off-peak' ? cfg.valleyColor : 'var(--dsw-alias-label-secondary)'; }
    function timeText(epoch, zone, date = false) {
      if (!Number.isFinite(epoch)) return '—';
      try { return new Intl.DateTimeFormat(undefined, { timeZone: zone || 'UTC', ...(date ? { year: 'numeric', month: '2-digit', day: '2-digit' } : {}), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(epoch)); } catch { return '—'; }
    }
    function Timeline({ status, now, t, compact = false }) {
      const cfg = settingsOf(status);
      const pieces = timelinePieces(status);
      const fraction = (now - status.dayStart) / (status.dayEnd - status.dayStart) * 100;
      return h('div', null,
        !compact && h('div', { className: 'pvp-small' }, t('timeline') + ' · ' + (status.date || '') + ' · ' + (cfg.timezone || 'UTC')),
        h('div', { className: 'pvp-timeline', role: 'img', 'aria-label': t('timeline') + ': ' + (pieces.length ? pieces.map((p) => p.start + '–' + p.end + ' ' + periodLabel(p.period, cfg, t)).join(', ') : t('unknown')) },
          pieces.map((p, index) => h('span', { key: index, className: 'pvp-segment', title: p.start + '–' + p.end + ' ' + periodLabel(p.period, cfg, t), style: { left: p.left + '%', width: p.width + '%', background: periodColor(p.period, cfg) } })),
          Number.isFinite(now) && fraction >= 0 && fraction <= 100 && h('span', { className: 'pvp-now', style: { left: Math.min(99.7, fraction) + '%' } })),
        !compact && h('div', { className: 'pvp-legend' }, ['peak', 'off-peak', ...(pieces.some((p) => p.period === 'unknown') ? ['unknown'] : [])].map((period) => h('span', { key: period }, h('i', { className: 'pvp-dot', style: { background: periodColor(period, cfg) } }), periodLabel(period, cfg, t))), !pieces.length && t('unknown')),
        !compact && pieces.length > 0 && h('div', { className: 'pvp-legend pvp-muted' }, pieces.map((p, index) => h('span', { key: index }, p.start + '–' + p.end + ' ' + periodLabel(p.period, cfg, t)))));
    }
    function UsageObserver({ controller, sessionId, useProjection }) {
      const projection = useProjection('peakValleyUsage');
      const view = useSnapshot(controller);
      React.useEffect(() => { controller.receiveUsage(sessionId, projection); }, [controller, sessionId, projection, view.usageEpoch]);
      React.useEffect(() => { controller.refreshUsage(sessionId); return () => controller.leaveUsageSession(sessionId); }, [controller, sessionId]);
      return null;
    }
    function Badge({ controller, locale, sessionId }) {
      const view = useSnapshot(controller);
      const t = useTranslation(locale);
      const ref = React.useRef(null);
      const labelRef = React.useRef(null);
      React.useEffect(() => controller.attachUsageAnchor(sessionId, labelRef.current), [controller, sessionId]);
      React.useEffect(() => { const element = ref.current; return () => { if (controller.getSnapshot().panel?.anchor === element) controller.close(false); }; }, [controller]);
      const status = view.status;
      const cfg = settingsOf(status);
      const current = currentOf(status);
      const seconds = secondsUntilSwitch(view.now, status?.nextSwitch);
      const label = current.period === 'unknown' ? t('unknown') : current.label || periodLabel(current.period, cfg, t);
      const panel = view.panel?.anchor === ref.current ? view.panel : null;
      return h('div', { className: 'pvp-badge-wrap', 'data-plugin': 'peak-valley-price' }, h(Style),
        h('button', {
          ref, type: 'button', className: 'pvp-badge-button', 'aria-haspopup': 'dialog', 'aria-expanded': Boolean(panel?.pinned),
          'aria-controls': panel ? 'pvp-details' : undefined, 'aria-describedby': panel && !panel.pinned ? 'pvp-details' : undefined,
          'aria-label': t('title') + ' · ' + (status ? label : t('loading')),
          onMouseEnter: (event) => controller.show(event.currentTarget), onMouseLeave: (event) => controller.leave(event.currentTarget),
          onFocus: (event) => controller.show(event.currentTarget), onBlur: (event) => controller.leave(event.currentTarget),
          onClick: (event) => controller.show(event.currentTarget, true)
        }, h('span', { ref: labelRef, className: 'pvp-pill', style: { color: periodColor(current.period, cfg) } }, status ? label : t('loading')),
        status && (cfg.showCountdown ?? true) && h('span', { className: 'pvp-muted pvp-countdown' }, seconds === 0 ? t('syncing') : seconds === null ? t('noSwitch') : t('until', { label: status.nextSwitch.label || periodLabel(status.nextSwitch.period, cfg, t), time: countdownText(seconds) })),
        cfg.showPrice && h('span', null, current.priceLabel || t('unknown')),
        cfg.showClock && h('span', { className: 'pvp-small' }, timeText(view.now, cfg.timezone)),
        view.error && h('span', { title: t('stale'), 'aria-label': t('stale') }, ' · !')),
        status && cfg.showBar && h(Timeline, { status, now: view.now, t, compact: true }));
    }
    function Details({ view, controller, t }) {
      const status = view.status;
      const cfg = settingsOf(status);
      const current = currentOf(status);
      const policy = status.policy || {};
      const next = status.nextSwitch;
      const selected = status.prices?.[status.priceModel || cfg.model];
      const row = (label, value) => [h('dt', { key: label + '-label' }, t(label)), h('dd', { key: label + '-value' }, value || t('notAvailable'))];
      const stamp = (value) => timeText(typeof value === 'number' ? value : Date.parse(value), cfg.timezone, true);
      return h(React.Fragment, null,
        h('dl', { className: 'pvp-list' },
          ...row('current', current.period === 'unknown' ? t('unknown') : current.label || periodLabel(current.period, cfg, t)),
          ...row('price', current.priceLabel),
          ...row('next', next ? (next.label || periodLabel(next.period, cfg, t)) + ' · ' + timeText(next.epoch, cfg.timezone, true) : t('noSwitch')),
          ...row('source', t(status.priceSource || cfg.priceMode || 'unknown')),
          ...row('model', status.priceModel || cfg.model), ...row('priceKind', t(status.priceKind || cfg.priceKind || 'unknown'))),
        current.reason && h('p', { className: 'pvp-muted' }, dictionaries.en[current.reason] ? t(current.reason) : current.reason),
        secondsUntilSwitch(view.now, next) === 0 && h('p', { className: 'pvp-warning', role: 'status' }, t('transitionPending')),
        selected && h('table', { className: 'pvp-table' }, h('caption', null, t('prices')),
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('priceKind')), h('th', { scope: 'col' }, cfg.peakLabel || t('peak')), h('th', { scope: 'col' }, cfg.valleyLabel || t('valley')))),
          h('tbody', null, ['cacheHit', 'cacheMiss', 'output'].map((kind) => h('tr', { key: kind }, h('th', { scope: 'row' }, t(kind)), h('td', null, selected.peak?.[kind] ?? '—'), h('td', null, selected.offPeak?.[kind] ?? '—'))))),
        h('details', { className: 'pvp-policy' }, h('summary', null, t('policy') + ' · ' + t(policy.source || 'unknown')),
          h('dl', { className: 'pvp-list' }, ...row('policyVersion', policy.version), ...row('checked', policy.checkedAt ? stamp(policy.checkedAt) : t('never')), ...row('success', policy.lastSuccessAt ? stamp(policy.lastSuccessAt) : t('never')), ...row('calendar', policy.calendarValidThrough), ...row('billingDate', status.billingDate)),
          typeof policy.sourceUrl === 'string' && /^https?:\/\//.test(policy.sourceUrl) && h('a', { className: 'pvp-link', href: policy.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, t('sourceLink'))),
        policy.warning && h('p', { className: 'pvp-warning' }, policy.warning),
        policy.lastError && h('p', { className: 'pvp-warning', role: 'status' }, policy.lastError),
        h('button', { type: 'button', className: 'pvp-button', disabled: Boolean(view.busy), onClick: () => controller.refreshPolicy().catch(() => {}) }, t(view.busy === 'refreshPolicy' ? 'refreshing' : 'refresh')));
    }
    const UsageFloatLayer = React.memo(function UsageFloatLayer({ items, controller }) {
      return items.map(item => h('span', { key: item.id, className: 'pvp-usage-float', 'data-plugin': 'peak-valley-usage-float', 'aria-hidden': true,
        style: { left: item.x, top: item.y, color: item.color, '--pvp-duration': item.duration + 'ms', animationDelay: item.delay + 'ms' },
        onAnimationEnd: (event) => { if (event.animationName === 'pvp-usage-fade') controller.dismissFloat(item.id); } }, item.text));
    });
    function Overlay({ controller, locale }) {
      const view = useSnapshot(controller);
      const t = useTranslation(locale);
      const panelRef = React.useRef(null);
      const [placement, setPlacement] = React.useState({});
      const panel = view.panel;
      React.useLayoutEffect(() => {
        if (!panel) return undefined;
        const place = () => {
          if (!panel.anchor?.isConnected) { controller.close(false); return; }
          const rect = panel.anchor.getBoundingClientRect(); // Only our own badge geometry.
          const width = Math.min(panel.pinned ? 420 : 320, window.innerWidth - 24);
          const above = rect.top > window.innerHeight / 2;
          setPlacement({ width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), ...(above ? { bottom: window.innerHeight - rect.top + 8, top: 'auto', maxHeight: Math.max(100, rect.top - 24) } : { top: rect.bottom + 8, bottom: 'auto', maxHeight: Math.max(100, window.innerHeight - rect.bottom - 24) }) });
        };
        const outside = (event) => { if (!panelRef.current?.contains(event.target) && !panel.anchor.contains(event.target)) controller.close(false); };
        const key = (event) => { if (event.key === 'Escape') { event.preventDefault(); controller.close(panel.pinned); } };
        place();
        if (panel.pinned) panelRef.current?.focus();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('keydown', key, true);
        return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key, true); };
      }, [panel, controller]);
      return h(React.Fragment, null, h(Style),
        h(UsageFloatLayer, { items: view.floaters, controller }),
        panel && h('div', { ref: panelRef, id: 'pvp-details', className: 'pvp-surface pvp-popover', style: placement, role: panel.pinned ? 'dialog' : 'tooltip', tabIndex: panel.pinned ? -1 : undefined, 'aria-label': t(panel.pinned ? 'details' : 'timeline'), onMouseEnter: () => controller.keep(), onMouseLeave: () => controller.leave(), onFocus: () => controller.keep(), onBlur: (event) => { if (panel.pinned && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== panel.anchor) controller.close(false); } },
          h('div', { className: 'pvp-heading' }, t(panel.pinned ? 'details' : 'timeline'), panel.pinned && h('button', { type: 'button', className: 'pvp-button', onClick: () => controller.close(true), 'aria-label': t('close') }, '×')),
          view.status ? h(Timeline, { status: view.status, now: view.now, t }) : h('p', null, t('loading')),
          view.error && h('p', { className: 'pvp-warning', role: 'status' }, t('stale') + ' ' + (dictionaries.en[view.error] ? t(view.error) : view.error)),
          panel.pinned && view.status && h(Details, { view, controller, t }),
          panel.pinned && !view.status && h('button', { className: 'pvp-button', onClick: () => controller.refresh() }, t('retry'))),
        view.notice && h('div', { className: 'pvp-surface pvp-notice', role: 'status', 'aria-live': 'polite' },
          t(view.notice.type === 'before' ? 'beforeNotice' : 'onNotice', { label: view.notice.label || periodLabel(view.notice.period, settingsOf(view.status), t), minutes: view.notice.minutes }),
          h('button', { type: 'button', className: 'pvp-button', 'aria-label': t('dismissReminder'), onClick: () => controller.dismissNotice() }, '×')));
    }
    const UsagePreview = React.memo(function UsagePreview({ cfg, period, t }) {
      const [sample, setSample] = React.useState(null);
      const [error, setError] = React.useState('');
      const sequence = React.useRef(0);
      React.useEffect(() => {
        if (!sample) return;
        const timer = window.setTimeout(() => setSample(null), sample.duration + 300);
        return () => window.clearTimeout(timer);
      }, [sample]);
      const play = () => {
        try {
          const next = usagePreviewSample(cfg, period);
          setError('');
          setSample({ ...next, id: ++sequence.current });
        } catch (failure) { setError(failure.message); }
      };
      return h('div', { className: 'pvp-preview' },
        h('div', { className: 'pvp-actions' },
          h('button', { type: 'button', className: 'pvp-button', onClick: play }, t('previewEffect')),
          h('span', { className: 'pvp-small' }, t('previewHelp'))),
        h('div', { className: 'pvp-preview-stage', 'aria-label': t('previewEffect') },
          h('span', { className: 'pvp-pill pvp-preview-label', style: { color: periodColor(period, cfg) } }, periodLabel(period, cfg, t)),
          sample && h('span', { key: sample.id, className: 'pvp-usage-float', 'aria-hidden': true,
            style: { position: 'absolute', left: '50%', top: 82, color: sample.color, '--pvp-duration': sample.duration + 'ms' },
            onAnimationEnd: (event) => { if (event.animationName === 'pvp-usage-fade') setSample((active) => active?.id === sample.id ? null : active); } }, sample.text)),
        error && h('p', { className: 'pvp-warning', role: 'status' }, dictionaries.en[error] ? t(error) : error));
    });
    function Settings({ controller, locale, view: surface }) {
      const state = useSnapshot(controller);
      const t = useTranslation(locale);
      const [draft, setDraft] = React.useState(null);
      const [touched, setTouched] = React.useState({});
      const [message, setMessage] = React.useState('');
      const [saving, setSaving] = React.useState(false);
      const original = React.useRef({});
      const revision = React.useRef(null);
      const namespace = React.useRef(null);
      const alive = React.useRef(true);
      React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
      const load = () => {
        original.current = settingsOf(state.status);
        revision.current = state.status?.configVersion;
        namespace.current = state.status?.configNamespace;
        setDraft({ ...original.current, peakWindows: JSON.stringify(original.current.peakWindows || [[1, 4], [6, 10]]), reminders: { ...OFF_REMINDERS, ...original.current.reminders } });
        setTouched({});
        setMessage('');
      };
      React.useEffect(() => { if (state.status && !Object.keys(touched).length && !saving) load(); }, [state.status]);
      if (surface === 'summary') return h('span', { className: 'pvp-muted' }, t('summary'));
      if (!draft) return h('div', { className: 'pvp-form' }, h(Style), t(state.error ? 'unavailable' : 'loading'), state.error && h('button', { className: 'pvp-button', onClick: () => controller.refresh() }, t('retry')));
      const modern = Boolean(state.status?.settings);
      const writable = canSaveSettings(state.status);
      const changed = revision.current !== state.status?.configVersion || namespace.current !== state.status?.configNamespace;
      const set = (key, value) => {
        setDraft((old) => ({ ...old, [key]: value, ...(key === 'usageFloatColor' ? { usageFloatFollowPeriod: false } : {}) }));
        setTouched((old) => ({ ...old, [key]: true, ...(key === 'usageFloatColor' ? { usageFloatFollowPeriod: true } : {}) }));
        setMessage('');
      };
      const field = (key, options) => h('label', { key, className: 'pvp-field' }, h('span', null, t(key)), options?.choices
        ? h('select', { className: 'pvp-input', value: draft[key] ?? options.fallback ?? '', disabled: saving || !writable || options.disabled, onChange: (event) => set(key, event.target.value) }, options.choices.map((value) => h('option', { key: value, value }, dictionaries.en[value] ? t(value) : value)))
        : h('input', { className: 'pvp-input', type: options?.type || 'text', value: draft[key] ?? options?.fallback ?? '', disabled: saving || !writable || options?.disabled, min: options?.min, max: options?.max, step: options?.step, onChange: (event) => set(key, event.target.value) }));
      const check = (key, disabled = false) => h('label', { key, className: 'pvp-check' }, h('input', { type: 'checkbox', checked: Boolean(draft[key]), disabled: saving || !writable || disabled, onChange: (event) => set(key, event.target.checked) }), t(key));
      const reminder = (key) => h('label', { key, className: 'pvp-check' }, h('input', { type: 'checkbox', checked: Boolean(draft.reminders[key]), disabled: saving || !writable || !modern, onChange: (event) => set('reminders', { ...draft.reminders, [key]: event.target.checked }) }), t(key));
      const customPrice = draft.priceMode === 'custom';
      const customRules = draft.ruleMode === 'custom';
      const save = async (event) => {
        event.preventDefault();
        if (saving) return;
        if (!writable) { setMessage('settingsUnavailable'); return; }
        if (changed) { setMessage('changed'); return; }
        let patch;
        try { patch = patchFromDraft(draft, touched, original.current); } catch (error) { setMessage(error.message); return; }
        if (!Object.keys(patch).length) return;
        setSaving(true);
        setMessage('');
        try {
          const status = await controller.save(patch, { configNamespace: namespace.current, configVersion: revision.current });
          if (!alive.current) return;
          original.current = settingsOf(status);
          revision.current = status.configVersion;
          namespace.current = status.configNamespace;
          setDraft({ ...original.current, peakWindows: JSON.stringify(original.current.peakWindows || []), reminders: { ...OFF_REMINDERS, ...original.current.reminders } });
          setTouched({});
          setMessage('saved');
        } catch (error) { if (alive.current) setMessage(error.message || 'failure'); }
        finally { if (alive.current) setSaving(false); }
      };
      return h('form', { className: 'pvp-form', onSubmit: save }, h(Style),
        !writable && h('p', { className: 'pvp-note', role: 'status' }, t('settingsUnavailable')),
        state.status?.configError && h('p', { className: 'pvp-warning', role: 'status' }, state.status.configError),
        h('fieldset', null, h('legend', null, t('display')), h('div', { className: 'pvp-grid' },
          field('peakLabel'), field('valleyLabel'), field('peakColor', { type: /^#[0-9a-f]{6}$/i.test(draft.peakColor) ? 'color' : 'text' }), field('valleyColor', { type: /^#[0-9a-f]{6}$/i.test(draft.valleyColor) ? 'color' : 'text' }),
          field('position', { choices: ['sidebar', 'dock', 'header', 'input-left', 'input-right', 'off'] }), field('timezone', { disabled: !modern })),
          h('div', { className: 'pvp-checks' }, ['showCountdown', 'showPrice', 'showBar', 'showClock'].map((key) => check(key)))),
        h('fieldset', null, h('legend', null, t('prices')), h('div', { className: 'pvp-grid' },
          field('priceMode', { choices: ['official', 'custom'], fallback: 'official', disabled: !modern }),
          field('model', { choices: ['deepseek-flash', 'deepseek-v4-pro'], fallback: 'deepseek-flash', disabled: !modern }),
          field('priceKind', { choices: ['cacheHit', 'cacheMiss', 'output'], fallback: 'cacheMiss', disabled: !modern }),
          field('peakPrice', { type: 'number', min: 0, step: 'any', disabled: modern && !customPrice }),
          field('valleyPrice', { type: 'number', min: 0, step: 'any', disabled: modern && !customPrice }),
          field('currency', { disabled: modern && !customPrice }), field('priceUnit', { disabled: modern && !customPrice })),
          customPrice && h('p', { className: 'pvp-note' }, t('customHelp'))),
        h('fieldset', null, h('legend', null, t('rules')), h('div', { className: 'pvp-grid' },
          field('ruleMode', { choices: ['official', 'custom'], fallback: 'official', disabled: !modern }), field('peakWindows', { disabled: !modern || !customRules })),
          h('p', { className: 'pvp-note' }, t('windowsHelp')),
          h('div', { className: 'pvp-checks' }, check('weekendAllValley', !modern || !customRules), check('holidaysAllValley', !modern || !customRules), check('autoUpdate', !modern))),
        h('fieldset', null, h('legend', null, t('usageEffect')),
          h('div', { className: 'pvp-grid' }, check('showUsageFloat', !modern), field('usageFloatUnit', { choices: ['tokens', 'cny'], fallback: 'tokens', disabled: !modern }),
            field('usageFloatColor', { type: 'color', fallback: '#3b6ef5', disabled: !modern }),
            field('usageFloatDuration', { type: 'number', min: 1, max: 8, step: .5, fallback: 3, disabled: !modern })),
          h('div', { className: 'pvp-checks' }, check('usageFloatFollowPeriod', !modern)),
          h('p', { className: 'pvp-note' }, t('usageEffectHelp')),
          h(UsagePreview, { cfg: draft, period: currentOf(state.status).period, t })),
        h('fieldset', null, h('legend', null, t('reminders')),
          h('label', { className: 'pvp-field' }, h('span', null, t('beforeMinutes')), h('input', { className: 'pvp-input', type: 'number', min: 1, max: 60, step: 1, disabled: saving || !writable || !modern, value: draft.reminders.beforeMinutes, onChange: (event) => set('reminders', { ...draft.reminders, beforeMinutes: event.target.value }) })),
          h('div', { className: 'pvp-checks' }, ['beforePeak', 'beforeValley', 'onPeak', 'onValley'].map(reminder)),
          h('p', { className: 'pvp-note' }, t('reminderHelp'))),
        Object.keys(touched).length > 0 && changed && h('p', { className: 'pvp-warning' }, t('changed')),
        h('div', { className: 'pvp-actions' }, h('button', { className: 'pvp-button', type: 'submit', disabled: saving || !writable || changed || !Object.keys(touched).length }, t(saving ? 'saving' : 'save')),
          h('button', { className: 'pvp-button', type: 'button', disabled: saving, onClick: load }, t('reset')),
          h('span', { role: 'status', className: message === 'saved' ? 'pvp-muted' : 'pvp-warning' }, dictionaries.en[message] ? t(message) : message)));
    }

    return {
      name: 'peak-valley-meter-client',
      inject: ['slots', 'connection', 'locale'],
      // Logic/controller seam for Node tests, without a DOM or React renderer.
      __test: { settingsBinding, canSaveSettings, createApi, Settings, usagePreviewSample, usageFloatAppearance, usageFloatText, createUsageGate, timerFacade, settingsOf, currentOf, serverTime, secondsUntilSwitch, countdownText, timelinePieces, parseWindows, patchFromDraft, eligibleReminders, reminderKey, claimReminder, createReminderGate, createController },
      apply(ctx) {
        const slots = ctx.get('slots');
        const connection = ctx.get('connection');
        const locale = ctx.get('locale');
        const report = (state, error) => connection?.rpc.call('/api', 'peak-valley-price/clientReport', { state, revision: '0.3.1-meter.1', message: error ? String(error.message || error) : '' }).catch(() => {});
        if (!slots || !connection) { report('error', new Error('Plugin services unavailable')); return; }
        try {
        if (locale) ctx.effect(() => locale.register(NS, dictionaries));
        ctx.effect(() => {
          let storage;
          try { storage = window.localStorage; } catch { /* Private/denied storage. */ }
          const controller = createController(createApi(connection), {
            wall: () => Date.now(), monotonic: () => performance.now(), visible: () => document.visibilityState !== 'hidden', storage, locks: navigator.locks,
            viewportWidth: () => window.innerWidth, viewportHeight: () => window.innerHeight,
            refreshUsage: (sessionId) => ctx.get('sessions')?.refreshProjections(sessionId),
            onUsage: (text) => report('loaded', 'usage-float: ' + text),
            ...timerFacade(window)
          });
          const disposers = [];
          // Prefer the renamed generation over any pre-rename UI still retained
          // by the page. Only this plugin's own entry IDs are registered here.
          const register = (name, options, Component) => slots.inject(name, () => slots.register({ name, locale: NS, priority: -1, ...options }, (props) => h(Component, { ...props, controller, locale })));
          const SLOT_OF = { header: 'conversation.session.header.utilities', dock: 'conversation.composer.dock', sidebar: 'sidebar.footer.action', 'input-left': 'conversation.input.left', 'input-right': 'conversation.input.right' };
          let cardDispose;
          let position;
          const syncPosition = () => {
            const status = controller.getSnapshot().status;
            if (!status) return;
            const next = settingsOf(status).position || 'sidebar';
            if (position === next) return;
            position = next;
            controller.close(false);
            cardDispose?.();
            cardDispose = next === 'off' ? null : register(SLOT_OF[next] || SLOT_OF.sidebar, { id: 'peak-valley-price', order: 100, label: () => locale ? locale.bind(NS)('title') : dictionaries.en.title }, Badge);
          };
          disposers.push(register('conversation.composer.dock', { id: 'peak-valley-usage-observer', order: 1000 }, UsageObserver));
          disposers.push(register('shell.overlay', { id: 'peak-valley-price', order: 100, label: () => locale ? locale.bind(NS)('title') : dictionaries.en.title }, Overlay));
          disposers.push(register('settings.section', { id: 'peak-valley-price', order: 40, label: () => locale ? locale.bind(NS)('title') : dictionaries.en.title }, Settings));
          disposers.push(register('plugins.bundle.config', { key: 'dsh-peak-valley-meter' }, Settings));
          disposers.push(controller.subscribe(syncPosition));
          syncPosition();
          const wake = () => controller.wake();
          const visibility = () => document.visibilityState === 'hidden' ? controller.hidden() : controller.wake();
          window.addEventListener('online', wake);
          window.addEventListener('focus', wake);
          window.addEventListener('pageshow', wake);
          document.addEventListener('visibilitychange', visibility);
          const offReset = ctx.on('connection/reset', wake);
          ctx.inject(['remote'], (inner) => {
            inner.effect(() => inner.remote.$on('settings/document-updated', (ns) => controller.invalidateSettings(ns)));
          });
          controller.start();
          return () => {
            controller.dispose();
            cardDispose?.();
            disposers.reverse().forEach((dispose) => dispose());
            offReset?.();
            window.removeEventListener('online', wake);
            window.removeEventListener('focus', wake);
            window.removeEventListener('pageshow', wake);
            document.removeEventListener('visibilitychange', visibility);
          };
        });
        report('loaded');
        } catch (error) { report('error', error); throw error; }
      }
    };
  }
});
