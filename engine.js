/** 本地规则驱动的座舱仿真。未接入原生小艺，也不控制真实车辆。
 * 数值范围、动画比例和确认机制为原型策略，不能作为实车安全依据。
 */
export const SEAT_TARGETS = ['driver', 'passenger', 'rearLeft', 'rearRight', 'thirdLeft', 'thirdRight'];
export const WINDOW_TARGETS = SEAT_TARGETS.slice(0, 4);
const LABELS = { driver: '主驾', passenger: '副驾', rearLeft: '二排左侧', rearRight: '二排右侧', thirdLeft: '三排左侧', thirdRight: '三排右侧', all: '全车', rear: '二排', front: '前排', third: '三排' };
const DOMAIN_LABELS = { window: '车窗', door: '车门', seat: '座椅', temperature: '温度', fan: '风量', climate: '空调', reading: '阅读灯', ambient: '氛围灯', rearScreen: '后排娱乐屏', shade: '遮阳帘', fragrance: '香氛', oxygen: '制氧', media: '媒体', scene: '情景模式', childLock: '儿童锁', chargePort: '充电口盖' };
const copy = value => structuredClone(value);
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isNum = value => typeof value === 'number' && Number.isFinite(value);

export function createInitialState() {
  return {
    gear: 'P', speed: 0, battery: 82, speaker: 'driver', scene: 'normal',
    capabilities: { electricDoors: true, rearScreen: true, fragrance: true, oxygen: false }, fault: null,
    windows: Object.fromEntries(WINDOW_TARGETS.map(target => [target, 0])),
    doors: Object.fromEntries(WINDOW_TARGETS.map(target => [target, false])),
    seats: Object.fromEntries(SEAT_TARGETS.map(target => [target, { position: 0, recline: 0, heat: 0, vent: 0, massage: false }])),
    climate: { power: true, driver: 24, passenger: 24, rearLeft: 24, rearRight: 24, fan: 2 },
    lights: { ambient: true, color: '#b3cda4', reading: Object.fromEntries(SEAT_TARGETS.map(target => [target, false])) },
    rearScreen: false, shade: 0, fragrance: false, oxygen: false,
    media: { playing: false, volume: 35 }, childLock: false, chargePort: false,
  };
}

function receipt(status, message, before, after, actions, context, options = {}) {
  const action = actions.at(-1);
  const nextContext = copy(context || {});
  const pending = options.pending ?? null;
  nextContext.pending = pending;
  if (status === 'success' && action) {
    nextContext.lastDomain = action.domain;
    nextContext.lastTarget = action.target ?? nextContext.lastTarget ?? null;
    nextContext.lastOperation = action.operation;
  }
  const failedStep = status === 'error' ? 'error' : status === 'blocked' ? 'blocked' : status === 'clarify' ? 'pending' : status;
  return {
    status, message, state: copy(after), before: copy(before), after: copy(after),
    actions: copy(actions), target: action?.target ?? null,
    intent: action ? `${action.domain}.${action.operation}` : null,
    evidence: 'adapted', pending, context: nextContext,
    steps: options.steps || [
      { label: '理解需求', detail: action ? actions.map(a => `${LABELS[a.target] || ''}${DOMAIN_LABELS[a.domain] || a.domain} · ${a.operation}`).join('；') : message, status: action ? 'success' : failedStep },
      { label: '检查条件', detail: status === 'success' ? '配置与模拟车态检查通过' : message, status: status === 'success' ? 'success' : failedStep },
      { label: '执行与反馈', detail: status === 'success' ? message : '未改变车辆状态', status: status === 'success' ? 'success' : 'pending' },
    ],
  };
}

function targetsFor(action, state, context) {
  const target = action.target ?? context.speaker ?? state.speaker;
  if (target === 'all') return action.domain === 'seat' || action.domain === 'reading' ? [...SEAT_TARGETS] : [...WINDOW_TARGETS];
  if (target === 'front') return ['driver', 'passenger'];
  if (target === 'rear') return ['rearLeft', 'rearRight'];
  if (target === 'third') return ['thirdLeft', 'thirdRight'];
  if (SEAT_TARGETS.includes(target)) return [target];
  return [];
}

function numericProblem(value, min, max, integer = false) {
  return !isNum(value) || value < min || value > max || (integer && !Number.isInteger(value));
}

function prepareAction(raw, state, context) {
  if (!raw || typeof raw !== 'object' || !DOMAIN_LABELS[raw.domain]) return { status: 'unsupported', message: '暂不支持这个控制项目。' };
  const action = copy(raw);
  const { domain, operation } = action;
  const validOperations = {
    window: ['open', 'close', 'set'], door: ['open', 'close'],
    seat: ['move', 'recline', 'heat', 'vent', 'massage'], temperature: ['set'], fan: ['set'],
    climate: ['open', 'close', 'toggle', 'set'], reading: ['open', 'close', 'toggle', 'set'],
    ambient: ['open', 'close', 'toggle', 'set', 'color'], rearScreen: ['open', 'close', 'toggle', 'set'],
    shade: ['open', 'close', 'set'], fragrance: ['open', 'close', 'toggle', 'set'], oxygen: ['open', 'close', 'toggle', 'set'],
    media: ['play', 'pause', 'volume'], scene: ['start', 'stop'], childLock: ['open', 'close', 'toggle', 'set'], chargePort: ['open', 'close', 'toggle', 'set'],
  };
  if (!validOperations[domain].includes(operation)) return { status: 'unsupported', message: `暂不支持这项${DOMAIN_LABELS[domain]}操作。`, action };
  const scoped = ['window', 'door', 'seat', 'temperature', 'reading'].includes(domain);
  let targets = scoped ? targetsFor(action, state, context) : [];
  if (scoped && !targets.length) return { status: 'clarify', message: `请说明要控制哪个座位的${DOMAIN_LABELS[domain]}，例如主驾或副驾。`, action, pending: { kind: 'target', actions: [action] } };
  if (scoped && action.target == null) action.target = targets.length === 1 ? targets[0] : action.target;
  if (['window', 'door', 'temperature'].includes(domain) && targets.some(target => !WINDOW_TARGETS.includes(target))) return { status: 'blocked', message: `本原型未配置三排独立${DOMAIN_LABELS[domain]}控制。`, action };
  if (domain === 'seat' && ['vent', 'massage'].includes(operation) && targets.some(target => target.startsWith('third'))) return { status: 'blocked', message: '本车型资料未确认三排座椅通风或按摩，仿真中不开放此操作。', action };

  const capability = { door: 'electricDoors', rearScreen: 'rearScreen', fragrance: 'fragrance', oxygen: 'oxygen' }[domain];
  if (capability && !state.capabilities[capability]) return { status: 'blocked', message: `当前演示配置未启用${DOMAIN_LABELS[domain]}，无法执行。`, action };
  if (state.scene === 'rest' && ['window', 'door'].includes(domain)) return { status: 'blocked', message: '小憩模式下暂停语音门窗控制，请先退出小憩模式。', action };
  const parkingRequired = domain === 'door' || domain === 'chargePort' || domain === 'scene' || (domain === 'seat' && ['move', 'recline'].includes(operation));
  if (parkingRequired && (state.gear !== 'P' || !isNum(state.speed) || state.speed !== 0)) return { status: 'blocked', message: '当前模拟车态不满足条件：请停车并切换到 P 挡后再操作。', action };
  if (((domain === 'door' && operation === 'open') || domain === 'window') && state.childLock && targets.some(t => t === 'rearLeft' || t === 'rearRight')) return { status: 'blocked', message: '后排儿童锁已开启，本原型暂停后排门窗控制。', action };

  let problem = '';
  if (domain === 'window' && operation === 'set' && numericProblem(action.value, 0, 100)) problem = '车窗开度需要在 0% 到 100% 之间。';
  if (domain === 'shade' && operation === 'set' && numericProblem(action.value, 0, 100)) problem = '遮阳帘开度需要在 0% 到 100% 之间。';
  if (domain === 'temperature' && numericProblem(action.value, 16, 30)) problem = '本原型温度范围为 16 到 30 度，请重新设置。';
  if (domain === 'fan' && numericProblem(action.value, 0, 7, true)) problem = '本原型风量范围为整数 0 到 7 挡。';
  if (domain === 'seat' && operation === 'move' && numericProblem(action.value, -1, 1)) problem = '座椅位置比例需要在 -1 到 1 之间。';
  if (domain === 'seat' && operation === 'recline' && numericProblem(action.value, 0, 1)) problem = '座椅靠背比例需要在 0 到 1 之间。';
  if (domain === 'seat' && ['heat', 'vent'].includes(operation) && numericProblem(action.value, 0, 3, true)) problem = '本原型座椅挡位需要是 0 到 3 的整数。';
  if (domain === 'seat' && operation === 'massage' && typeof action.value !== 'boolean') problem = '按摩需要明确开启或关闭。';
  if (domain === 'media' && operation === 'volume' && numericProblem(action.value, 0, 100, true)) problem = '音量需要是 0 到 100 的整数。';
  if (domain === 'ambient' && operation === 'color' && (typeof action.value !== 'string' || !/^#[\da-f]{6}$/i.test(action.value))) problem = '请提供有效的六位十六进制灯光颜色。';
  if (['climate', 'reading', 'ambient', 'rearScreen', 'fragrance', 'oxygen', 'childLock', 'chargePort'].includes(domain) && operation === 'set' && typeof action.value !== 'boolean') problem = '开关状态必须明确为开启或关闭。';
  if (domain === 'scene' && operation === 'start' && !['normal', 'cinema', 'rest', 'camp'].includes(action.value)) problem = '暂不支持这个情景模式。';
  if (problem) return { status: 'blocked', message: problem, action };
  if (domain === 'scene' && operation === 'start' && action.value === 'cinema' && !state.capabilities.rearScreen) return { status: 'blocked', message: '影院模式需要后排娱乐屏，当前配置未启用。', action };
  if (domain === 'scene' && operation === 'start' && action.value !== 'normal' && state.scene !== 'normal' && state.scene !== action.value) return { status: 'blocked', message: '情景模式互斥，请先退出当前模式，再开启另一个模式。', action };
  if (domain === 'scene' && operation === 'start' && action.value === 'rest' && (!isNum(state.battery) || state.battery <= 20)) return { status: 'blocked', message: '小憩模式要求电量高于 20%，请先补充电量。', action };
  if (state.fault) return { status: 'error', message: ['offline', 'network', 'network_offline'].includes(state.fault) ? '模拟服务离线，指令未执行；恢复连接后可重试。' : state.fault === 'timeout' ? '模拟执行超时，未确认执行成功，车辆状态保持不变。' : '模拟车辆工具执行失败，车辆状态保持不变。', action };
  const opensChargePort = domain === 'chargePort' && (operation === 'open' || (operation === 'set' && action.value === true) || (operation === 'toggle' && !state.chargePort));
  if (!context.confirmed && ((domain === 'door' && operation === 'open') || opensChargePort)) return { status: 'clarify', message: `即将打开${LABELS[action.target] || ''}${DOMAIN_LABELS[domain]}，请说“确认”或“取消”。`, action, pending: { kind: 'confirm', actions: [action] } };
  return { action, targets };
}

const sceneKeys = ['seats', 'climate', 'lights', 'rearScreen', 'shade', 'media', 'fragrance'];
const switched = (operation, value, old) => operation === 'set' ? value : operation === 'toggle' ? !old : operation === 'open';

function applyPrepared(prepared, state, context) {
  const { action: a, targets } = prepared;
  const { domain: d, operation: op, value: v } = a;
  const label = LABELS[a.target] || '';
  let message = '';
  if (d === 'window') {
    const value = op === 'open' ? 100 : op === 'close' ? 0 : v;
    targets.forEach(t => { state.windows[t] = value; });
    message = `${label}车窗已${value === 0 ? '关闭' : `打开至 ${value}%`}。`;
  } else if (d === 'door') {
    targets.forEach(t => { state.doors[t] = op === 'open'; });
    message = `${label}车门已${op === 'open' ? '打开' : '关闭'}。`;
  } else if (d === 'seat') {
    const key = op === 'move' ? 'position' : op;
    targets.forEach(t => {
      state.seats[t][key] = v;
      if (op === 'heat' && v > 0) state.seats[t].vent = 0;
      if (op === 'vent' && v > 0) state.seats[t].heat = 0;
    });
    const text = { move: '位置', recline: '靠背', heat: '加热', vent: '通风', massage: '按摩' }[op];
    message = `${label}座椅${text}已${op === 'massage' ? v ? '开启' : '关闭' : ['heat', 'vent'].includes(op) ? v === 0 ? '关闭' : `设为 ${v} 挡` : '调整'}。`;
    if (['heat', 'vent'].includes(op) && v > 0) message += ` ${op === 'heat' ? '通风' : '加热'}已关闭。`;
  } else if (d === 'temperature') {
    targets.forEach(t => {
      state.climate[t] = v;
      if (t === 'rearLeft' || t === 'rearRight') { state.climate.rearLeft = v; state.climate.rearRight = v; }
    }); state.climate.power = true;
    message = `${targets.every(t => t.startsWith('rear')) ? '后排温区' : label}温度已设为 ${v} 度。`;
  } else if (d === 'fan') {
    state.climate.fan = v; if (v > 0) state.climate.power = true;
    message = `风量已设为 ${v} 挡。`;
  } else if (d === 'climate') {
    state.climate.power = switched(op, v, state.climate.power); message = `空调已${state.climate.power ? '开启' : '关闭'}。`;
  } else if (d === 'reading') {
    targets.forEach(t => { state.lights.reading[t] = switched(op, v, state.lights.reading[t]); });
    message = `${label}阅读灯已${targets.every(t => state.lights.reading[t]) ? '开启' : '关闭'}。`;
  } else if (d === 'ambient') {
    if (op === 'color') { state.lights.color = v; state.lights.ambient = true; message = '氛围灯颜色已更新。'; }
    else { state.lights.ambient = switched(op, v, state.lights.ambient); message = `氛围灯已${state.lights.ambient ? '开启' : '关闭'}。`; }
  } else if (d === 'shade') {
    state.shade = op === 'open' ? 100 : op === 'close' ? 0 : v; message = `遮阳帘已${state.shade === 0 ? '关闭' : `打开至 ${state.shade}%`}。`;
  } else if (['rearScreen', 'fragrance', 'oxygen', 'childLock', 'chargePort'].includes(d)) {
    state[d] = switched(op, v, state[d]);
    message = `${DOMAIN_LABELS[d]}已${d === 'rearScreen' ? state[d] ? '展开' : '收起' : state[d] ? '开启' : '关闭'}。`;
  } else if (d === 'media') {
    if (op === 'volume') { state.media.volume = v; message = `音量已设为 ${v}。`; }
    else { state.media.playing = op === 'play'; message = `模拟媒体已${state.media.playing ? '播放' : '暂停'}。`; }
  } else if (d === 'scene') {
    const mode = op === 'stop' ? 'normal' : v;
    if (mode === state.scene) return mode === 'normal' ? '当前已经处于正常模式。' : '当前模式已经开启，座舱状态保持不变。';
    if (mode === 'normal') {
      if (context.sceneSnapshot) for (const key of sceneKeys) if (has(context.sceneSnapshot, key)) state[key] = copy(context.sceneSnapshot[key]);
      if (!state.capabilities.rearScreen) state.rearScreen = false;
      if (!state.capabilities.fragrance) state.fragrance = false;
      delete context.sceneSnapshot;
      state.scene = 'normal'; message = '已退出情景模式，恢复进入模式前的座舱设置。';
    } else {
      if (!context.sceneSnapshot) context.sceneSnapshot = Object.fromEntries(sceneKeys.map(key => [key, copy(state[key])]));
      else for (const key of sceneKeys) state[key] = copy(context.sceneSnapshot[key]);
      if (!state.capabilities.rearScreen) state.rearScreen = false;
      if (!state.capabilities.fragrance) state.fragrance = false;
      state.scene = mode;
      if (mode === 'cinema') { state.rearScreen = true; state.shade = 0; state.lights.ambient = false; state.media.playing = true; }
      if (mode === 'rest') { state.climate.power = true; state.climate.fan = 1; state.seats.passenger.recline = 0.65; state.shade = 0; state.media.playing = false; SEAT_TARGETS.forEach(t => { state.lights.reading[t] = false; }); }
      if (mode === 'camp') { state.climate.power = true; state.shade = 100; state.lights.ambient = true; }
      message = `已进入${{ cinema: '影院', rest: '小憩', camp: '露营' }[mode]}模拟模式。`;
    }
  }
  return message;
}

function runActions(actions, state, inputContext = {}, { confirmed = false } = {}) {
  const before = copy(state), next = copy(state), context = copy(inputContext);
  delete context.confirmed;
  context.pending = null;
  const messages = [], resolved = [];
  for (const action of actions) {
    const prepared = prepareAction(action, next, { ...context, confirmed });
    const resolvedAction = prepared.action ?? action;
    resolved.push(resolvedAction);
    if (prepared.status) {
      const pending = prepared.pending ? { ...prepared.pending, actions: copy([...resolved, ...actions.slice(resolved.length)]) } : null;
      return receipt(prepared.status, prepared.message, before, before, [...resolved, ...actions.slice(resolved.length)], inputContext, { pending });
    }
    messages.push(applyPrepared(prepared, next, context));
  }
  return receipt('success', messages.join(' '), before, next, resolved, context);
}

export function performAction(action, state, context = {}) {
  return runActions([action], state, context);
}

/** 模型提出的复合动作共用本地条件检查；失败或待确认时全部保持原态。 */
export function performActions(actions, state, context = {}) {
  if (!Array.isArray(actions) || actions.length < 1 || actions.length > 4) {
    return receipt('unsupported', '一次只支持 1 到 4 个明确动作，车辆状态未改变。', state, state, [], context);
  }
  return runActions(actions, state, context);
}

function chineseNumber(raw) {
  if (raw == null) return null;
  const source = String(raw).replace(/两/g, '二').replace(/点/g, '.').replace(/^负/, '-');
  if (/^-?\d+(?:\.\d+)?$/.test(source)) return Number(source);
  if (source.startsWith('-')) { const value = chineseNumber(source.slice(1)); return value === null ? null : -value; }
  const digits = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (source === '百' || source === '一百') return 100;
  const decimal = source.split('.');
  let integer;
  if (decimal[0].includes('十')) { const [a, b] = decimal[0].split('十'); integer = (a ? digits[a] : 1) * 10 + (b ? digits[b] : 0); }
  else integer = digits[decimal[0]];
  if (!Number.isFinite(integer)) return null;
  if (decimal.length > 1) {
    const fraction = decimal[1].split('').map(c => digits[c] ?? c).join('');
    return /^\d+$/.test(fraction) ? Number(`${integer}.${fraction}`) : null;
  }
  return integer;
}
const numberPattern = '(-?\\d+(?:\\.\\d+)?|负?[零一二两三四五六七八九十百]+(?:点[零一二三四五六七八九]+)?)';
const amount = (text, suffix) => chineseNumber(text.match(new RegExp(`${numberPattern}\\s*(?:${suffix})`))?.[1]);

function targetFrom(text) {
  if (/全部|所有|全车|每个/.test(text)) return 'all';
  if (/(?:第三排|三排|后后排).*(?:左)|左.*(?:第三排|三排)/.test(text)) return 'thirdLeft';
  if (/(?:第三排|三排|后后排).*(?:右)|右.*(?:第三排|三排)/.test(text)) return 'thirdRight';
  if (/第三排|三排/.test(text)) return 'third';
  if (/左后|后左|(?:后排|二排|第二排).*左|左.*(?:后排|二排)/.test(text)) return 'rearLeft';
  if (/右后|后右|(?:后排|二排|第二排).*右|右.*(?:后排|二排)/.test(text)) return 'rearRight';
  if (/副驾|右前|前排右/.test(text)) return 'passenger';
  if (/主驾|驾驶位|驾驶席|驾驶员|司机|左前|前排左/.test(text)) return 'driver';
  if (/后排|二排|第二排/.test(text)) return 'rear';
  if (/前排/.test(text)) return 'front';
  return undefined;
}

function inferTarget(text, state, context, relative = false) {
  const explicit = targetFrom(text);
  if (explicit) return explicit;
  if (/这边|这个|这里/.test(text) && context.selectedTarget) return context.selectedTarget;
  if (relative && context.lastTarget) return context.lastTarget;
  return context.speaker ?? state.speaker;
}

function parseCommand(text, state, context) {
  const close = /关闭|关掉|关上|关了|关一下|收起|合上|停止|停掉|取消|暂停|退出/.test(text);
  const open = /打开|开启|开一下|开起来|开到|展开|启动|进入|播放|来点/.test(text);
  const target = inferTarget(text, state, context);
  const onOff = close ? 'close' : open ? 'open' : null;
  const simple = (domain, operation = onOff, value, scoped = false) => operation ? { actions: [{ domain, operation, ...(scoped ? { target } : {}), ...(value !== undefined ? { value } : {}) }] } : { message: `请说明要如何调整${DOMAIN_LABELS[domain]}。` };
  if (/退出.*模式|恢复正常|正常模式/.test(text)) return simple('scene', 'stop');
  if (/影院|观影|小憩|休息模式|露营/.test(text)) return simple('scene', close ? 'stop' : 'start', /影院|观影/.test(text) ? 'cinema' : /露营/.test(text) ? 'camp' : 'rest');
  if (/儿童锁/.test(text)) return simple('childLock');
  if (/充电.*(?:盖|口)|充电口/.test(text)) return simple('chargePort');
  if (/后排.*(?:屏|电视)|娱乐屏|投影屏|幕布/.test(text)) return simple('rearScreen');
  if (/遮阳帘|遮光帘/.test(text)) {
    const percent = amount(text, '%|％|百分比') ?? chineseNumber(text.match(new RegExp(`百分之${numberPattern}`))?.[1]);
    return simple('shade', percent !== null ? 'set' : /一半|半开/.test(text) ? 'set' : onOff, percent ?? (/一半|半开/.test(text) ? 50 : undefined));
  }
  if (/制氧|氧气/.test(text)) return simple('oxygen');
  if (/香氛/.test(text)) return simple('fragrance');
  if (/阅读灯|读书灯/.test(text)) return simple('reading', onOff, undefined, true);
  if (/氛围灯/.test(text)) {
    const colors = { 蓝: '#8cb5f5', 红: '#ef7e83', 绿: '#b3cda4', 紫: '#bb9af7', 橙: '#edb46f', 白: '#fff1dc', 粉: '#f2a1d0', 青: '#78d7d0', 黄: '#e8d374' };
    const found = Object.keys(colors).find(color => text.includes(color));
    return simple('ambient', found ? 'color' : onOff, found ? colors[found] : undefined);
  }
  if (/车门|开门|关门|主驾门|副驾门|左前门|右前门|左后门|右后门|后排门/.test(text)) return simple('door', /开门/.test(text) ? 'open' : /关门/.test(text) ? 'close' : onOff, undefined, true);
  if (/车窗|窗户|开窗|关窗|左前窗|右前窗|左后窗|右后窗|主驾窗|副驾窗/.test(text)) {
    const percent = amount(text, '%|％|百分比') ?? chineseNumber(text.match(new RegExp(`百分之${numberPattern}`))?.[1]);
    if (percent !== null) return simple('window', 'set', percent, true);
    if (/一半|半开/.test(text)) return simple('window', 'set', 50, true);
    if (/降到底|完全打开|全开|开窗/.test(text)) return simple('window', 'open', undefined, true);
    if (/升到顶|完全关闭|关窗/.test(text)) return simple('window', 'close', undefined, true);
    if (/降一点|下降一点|升一点|上升一点/.test(text)) {
      const ts = targetsFor({ domain: 'window', target }, state, context);
      if (!ts.length) return simple('window', 'set', 10, true);
      const delta = /降/.test(text) ? 10 : -10;
      return { actions: ts.map(t => ({ domain: 'window', operation: 'set', target: t, value: state.windows[t] + delta })) };
    }
    return simple('window', onOff, undefined, true);
  }
  if (/座椅|按摩|通风|加热|靠背/.test(text)) {
    if (/按摩/.test(text)) return simple('seat', 'massage', !close, true);
    if (/通风|加热/.test(text)) {
      const level = amount(text, '挡|档|级');
      return simple('seat', /通风/.test(text) ? 'vent' : 'heat', close ? 0 : level ?? 1, true);
    }
    if (/靠背|躺|放倒|坐直/.test(text)) {
      let value = amount(text, '%|％');
      if (value !== null) value /= 100;
      else if (/坐直|复位|竖起/.test(text)) value = 0;
      else if (/躺|后仰|放倒|降低/.test(text)) value = 0.65;
      else return { message: '请说明靠背要后仰还是恢复直立。' };
      return simple('seat', 'recline', value, true);
    }
    if (/前|后|复位|恢复/.test(text.replace(/主驾|副驾|前排|后排|二排|第三排|三排|左前|右前|左后|右后/g, ''))) {
      const motion = text.replace(/主驾|副驾|前排|后排|二排|第三排|三排|左前|右前|左后|右后/g, '');
      const ts = targetsFor({ domain: 'seat', target }, state, context);
      if (!ts.length) return simple('seat', 'move', 0, true);
      const delta = /复位|恢复/.test(motion) ? null : /后/.test(motion) ? -0.25 : 0.25;
      return { actions: ts.map(t => ({ domain: 'seat', operation: 'move', target: t, value: delta === null ? 0 : Math.round((state.seats[t].position + delta) * 100) / 100 })) };
    }
    return { message: '请说明要调节座椅位置、靠背、加热、通风还是按摩。' };
  }
  const relative = /再|一点|一些|调高|调低|升高|降低|大点|小点|冷一点|热一点|凉一点|暖一点/.test(text);
  const bareRelative = /^(?:再|稍微|帮我|请)?(?:调高|调低|升高|降低|高|低|大|小)(?:一点|一些|点|些)[。！!\s]*$/.test(text);
  const relativeDown = /低|降低|减|小|冷|凉/.test(text);
  const temperature = /温度|太热|太冷|冷一点|热一点|凉一点|暖一点/.test(text) || amount(text, '度|℃') !== null || (/空调/.test(text) && /调到|设为/.test(text)) || (bareRelative && context.lastDomain === 'temperature');
  if (temperature && !/音量|风量/.test(text)) {
    const t = inferTarget(text, state, context, relative);
    const value = amount(text, '度|℃') ?? chineseNumber(text.match(new RegExp(`(?:调到|设为|设置为)\\s*${numberPattern}[。！!\\s]*$`))?.[1]);
    const isDelta = /(?:调高|调低|升高|降低|增加|减少|再高|再低|高|低)\s*(?:\d|[一二两三四五六七八九十])/.test(text);
    if (value !== null && !isDelta) return { actions: [{ domain: 'temperature', operation: 'set', target: t, value }] };
    if (relative || /太热|太冷/.test(text)) {
      const ts = targetsFor({ domain: 'temperature', target: t }, state, context);
      if (!ts.length) return { message: '请说明要调整哪个座位的温度。', clarify: true };
      const delta = (relativeDown || /太热/.test(text) ? -1 : 1) * (value ?? 1);
      return { actions: ts.map(zone => ({ domain: 'temperature', operation: 'set', target: zone, value: state.climate[zone] + delta })) };
    }
    return { message: '请说具体温度，例如“副驾温度调到24度”。', clarify: true };
  }
  if (/风量|风速|风大|风小/.test(text) || (bareRelative && context.lastDomain === 'fan')) {
    const value = amount(text, '挡|档|级');
    if (value !== null && !/再|增加|减少/.test(text)) return simple('fan', 'set', value);
    if (relative || /风大|风小/.test(text)) return simple('fan', 'set', state.climate.fan + (relativeDown || /太大/.test(text) ? -1 : 1) * (value ?? 1));
    return { message: '请说明风量挡位，例如“风量调到三挡”。', clarify: true };
  }
  if (/空调/.test(text)) return simple('climate');
  if (/音量|声音/.test(text) || (bareRelative && context.lastDomain === 'media' && context.lastOperation === 'volume')) {
    const value = chineseNumber(text.match(new RegExp(`(?:到|设为|设置为|音量)\\s*${numberPattern}`))?.[1]) ?? amount(text, '%|％');
    if (value !== null) return simple('media', 'volume', value);
    if (/静音/.test(text)) return simple('media', 'volume', 0);
    if (relative) return simple('media', 'volume', state.media.volume + (relativeDown ? -5 : 5));
    return { message: '请说明音量，例如“音量调到30”。', clarify: true };
  }
  if (/播放|暂停|音乐|歌曲|媒体/.test(text)) return simple('media', close ? 'pause' : /播放|来点|继续/.test(text) ? 'play' : null);
  if (relative && !context.lastDomain) return { message: '还不知道要调整什么，请说完整指令，例如“副驾温度调低一点”。', clarify: true };
  return { message: '这句话暂不在本地仿真支持范围内。可以试试“副驾温度调到24度”或“打开左后车窗”。' };
}

function answerQuery(text, state, context, targetOverride) {
  let domain = null;
  if (/车窗|窗户|左前窗|右前窗|左后窗|右后窗/.test(text)) domain = 'window';
  else if (/车门|左前门|右前门|左后门|右后门/.test(text)) domain = 'door';
  else if (/座椅|按摩|通风|加热|靠背/.test(text)) domain = 'seat';
  else if (/温度|多少度|几度/.test(text)) domain = 'temperature';
  else if (/风量|风速/.test(text)) domain = 'fan';
  else if (/空调/.test(text)) domain = 'climate';
  else if (/阅读灯/.test(text)) domain = 'reading';
  else if (/氛围灯/.test(text)) domain = 'ambient';
  else if (/后排.*屏|娱乐屏/.test(text)) domain = 'rearScreen';
  else if (/遮阳帘/.test(text)) domain = 'shade';
  else if (/香氛/.test(text)) domain = 'fragrance';
  else if (/制氧/.test(text)) domain = 'oxygen';
  else if (/音乐|媒体|音量/.test(text)) domain = 'media';
  else if (/儿童锁/.test(text)) domain = 'childLock';
  else if (/充电口|充电盖/.test(text)) domain = 'chargePort';
  else if (/模式/.test(text)) domain = 'scene';
  else if (!/车辆|座舱|车况|电量|速度|车速|挡位|档位|状态/.test(text)) return null;
  const scoped = ['window', 'door', 'seat', 'temperature', 'reading'].includes(domain);
  const target = targetOverride ?? inferTarget(text, state, context);
  const targets = scoped ? targetsFor({ domain, target }, state, context) : [];
  if (scoped && !targets.length) return receipt('clarify', `请说明要查询哪个座位的${DOMAIN_LABELS[domain]}。`, state, state, [], context, { pending: { kind: 'target', query: text, actions: [] } });
  if (['window', 'door', 'temperature'].includes(domain) && targets.some(t => !WINDOW_TARGETS.includes(t))) return receipt('unsupported', `本原型没有三排独立${DOMAIN_LABELS[domain]}状态。`, state, state, [], context);
  const on = value => value ? '开启' : '关闭';
  let message;
  if (domain === 'window') message = targets.map(t => `${LABELS[t]}车窗${state.windows[t] === 0 ? '已关闭' : `开度 ${state.windows[t]}%`}`).join('；');
  if (domain === 'door') message = targets.map(t => `${LABELS[t]}车门${on(state.doors[t])}`).join('；');
  if (domain === 'seat') message = targets.map(t => `${LABELS[t]}座椅加热 ${state.seats[t].heat} 挡，通风 ${state.seats[t].vent} 挡，按摩${on(state.seats[t].massage)}`).join('；');
  if (domain === 'temperature') message = targets.map(t => `${t.startsWith('rear') ? '后排温区' : LABELS[t]}设定温度 ${state.climate[t]} 度`).filter((v, i, all) => all.indexOf(v) === i).join('；');
  if (domain === 'fan') message = `当前风量 ${state.climate.fan} 挡，空调${on(state.climate.power)}`;
  if (domain === 'climate') message = `空调${on(state.climate.power)}，主驾 ${state.climate.driver} 度，副驾 ${state.climate.passenger} 度，后排 ${state.climate.rearLeft} 度，风量 ${state.climate.fan} 挡`;
  if (domain === 'reading') message = targets.map(t => `${LABELS[t]}阅读灯${on(state.lights.reading[t])}`).join('；');
  if (domain === 'ambient') message = `氛围灯${on(state.lights.ambient)}，模拟色值 ${state.lights.color}`;
  if (domain === 'rearScreen') message = state.capabilities.rearScreen ? `后排娱乐屏已${state.rearScreen ? '展开' : '收起'}` : '当前未启用后排娱乐屏配置';
  if (domain === 'shade') message = `遮阳帘开度 ${state.shade}%`;
  if (domain === 'fragrance' || domain === 'oxygen') message = state.capabilities[domain] ? `${DOMAIN_LABELS[domain]}${on(state[domain])}` : `当前未启用${DOMAIN_LABELS[domain]}配置`;
  if (domain === 'media') message = `模拟媒体${state.media.playing ? '播放中' : '已暂停'}，音量 ${state.media.volume}`;
  if (domain === 'childLock' || domain === 'chargePort') message = `${DOMAIN_LABELS[domain]}${on(state[domain])}`;
  if (domain === 'scene') message = `当前是${{ normal: '正常', rest: '小憩', cinema: '影院', camp: '露营' }[state.scene] || state.scene}模式`;
  if (!domain) message = `当前 ${state.gear} 挡，车速 ${state.speed} 千米每小时，电量 ${state.battery}%，${{ normal: '正常', rest: '小憩', cinema: '影院', camp: '露营' }[state.scene] || state.scene}模式`;
  const result = receipt('success', `本地模拟状态：${message}。`, state, state, [], context, { steps: [
    { label: '理解查询', detail: `查询${DOMAIN_LABELS[domain] || '车辆'}状态`, status: 'success' },
    { label: '读取状态', detail: '读取网页仿真快照，不调用真实车辆', status: 'success' },
    { label: '反馈结果', detail: '仅查询，未改变车辆状态', status: 'success' },
  ] });
  result.target = scoped ? target : null;
  result.intent = `${domain || 'vehicle'}.query`;
  result.evidence = 'design';
  if (domain) {
    result.context.lastDomain = domain;
    if (scoped) result.context.lastTarget = target;
    result.context.lastOperation = domain === 'media' && /音量/.test(text) ? 'volume' : 'query';
  }
  return result;
}

export function executeCommand(input, state, inputContext = {}) {
  const context = copy(inputContext);
  const text = String(input ?? '').trim().replace(/^(?:你好[，, ]*)?(?:小艺小艺|小艺)[，,！!：:\s]*/, '').trim();
  if (!text) return receipt('unsupported', '没有收到有效指令，请重新输入或说话。', state, state, [], context);
  if (/^(?:取消|算了|不用了|停止执行|别执行|不要执行|取消操作)[。！!\s]*$/.test(text) || /(?:不|别|勿)(?:要|想|允许|希望|可以|用)?(?:再|帮我|给我)?(?:打开|开启|关闭|关掉|进入|启动|播放|执行|调节|调整|开|关|调|升|降)/.test(text)) return receipt('cancelled', '已取消，本次没有改变车辆状态。', state, state, [], context);
  if (/^(?:确认|确定|好的|是的|执行|确认执行|确认打开)[。！!\s]*$/.test(text)) {
    if (context.pending?.kind !== 'confirm') return receipt('unsupported', '当前没有等待确认的操作。', state, state, [], context);
    return runActions(context.pending.actions, state, context, { confirmed: true });
  }
  if (context.pending?.kind === 'target' && targetFrom(text) && /^(?:主驾|副驾|驾驶位|左前|右前|左后|右后|后排左侧|后排右侧|二排左侧|二排右侧|三排左侧|三排右侧|前排|后排|全车|全部)[。！!\s]*$/.test(text)) {
    if (context.pending.query) return answerQuery(context.pending.query, state, context, targetFrom(text));
    return runActions(context.pending.actions.map(action => ({ ...action, target: targetFrom(text) })), state, context);
  }
  if (!/如果|假如|假设|然后|并且/.test(text) && /查询|查看|多少|几度|几挡|几档|状态|是否|是不是|有没有|了吗|了么|了没|着吗|什么模式|什么温度/.test(text) && !/调到|设为|设置为|调成/.test(text)) {
    const answer = answerQuery(text, state, context);
    if (answer) return answer;
  }
  if (/怎么|如何|为什么|支持什么|有哪些|打不开|关不上|不能打开|不能关闭|多少度|什么温度|现在.*(?:状态|温度)/.test(text)) return receipt('unsupported', '这是一条咨询或故障描述，未执行控制。请在功能手册查看示例，或说出明确的控制指令。', state, state, [], context);
  if (/如果|假如|假设|当.+时|明天|分钟后|小时后|等.*再|定时|预约/.test(text)) return receipt('unsupported', '暂不支持条件触发或预约控制，本次未执行。请在需要时发送直接指令。', state, state, [], context);
  if (/除雾|除霜|玻璃加热|方向盘加热|后视镜加热|天窗|前备箱|后备箱/.test(text)) return receipt('unsupported', '这项部件控制暂未纳入本次座舱原型，未执行任何操作。', state, state, [], context);
  const clauses = text.split(/[,，;；]|然后|并且|(?:并|和)(?=打开|关闭|开启|调|把|将|播放)/).map(s => s.trim()).filter(Boolean);
  const actions = [];
  for (const clause of clauses) {
    if (/和|以及|与/.test(clause)) return receipt('clarify', '这句话包含多个对象，请分别说明，例如“打开主驾车窗，然后打开副驾车窗”。', state, state, [], context);
    const containsWindow = /车窗|窗户|开窗|关窗|左前窗|右前窗|左后窗|右后窗|主驾窗|副驾窗/.test(clause);
    const containsDoor = /车门|开门|关门|主驾门|副驾门|左前门|右前门|左后门|右后门/.test(clause);
    if (containsWindow && containsDoor) return receipt('clarify', '门和窗是不同设备，请用“然后”分开两条明确指令。', state, state, [], context);
    const parsed = parseCommand(clause, state, context);
    if (!parsed.actions) return receipt(parsed.clarify ? 'clarify' : 'unsupported', parsed.message, state, state, actions, context);
    actions.push(...parsed.actions);
  }
  return runActions(actions, state, context);
}

export const TEST_SCENARIOS = [
  { id: 'window-open', name: '指定车窗打开', description: '开度与目标一致', query: '打开左后车窗', setup: {}, expect: { status: 'success', path: 'windows.rearLeft', value: 100 } },
  { id: 'window-percent', name: '百分比开窗', description: '副驾打开一半', query: '副驾车窗打开50%', setup: {}, expect: { status: 'success', path: 'windows.passenger', value: 50 } },
  { id: 'window-range', name: '拒绝越界开度', description: '无效数值不改变车辆', query: '副驾车窗打开120%', setup: {}, expect: { status: 'blocked', path: 'windows.passenger', value: 0 } },
  { id: 'door-parked', name: '开门需确认', description: '确认前车门保持关闭', query: '打开副驾车门', setup: {}, expect: { status: 'clarify', path: 'doors.passenger', value: false } },
  { id: 'door-confirm', name: '确认后开门', description: '多轮确认同一目标', query: '打开副驾车门', turns: ['打开副驾车门', '确认'], setup: {}, expect: { status: 'success', path: 'doors.passenger', value: true } },
  { id: 'door-cancel', name: '取消不执行', description: '取消待确认任务', query: '打开副驾车门', turns: ['打开副驾车门', '取消'], setup: {}, expect: { status: 'cancelled', path: 'doors.passenger', value: false } },
  { id: 'door-moving', name: '行驶中拒绝开门', description: '检查速度与挡位', query: '打开副驾车门', setup: { gear: 'D', speed: 35 }, expect: { status: 'blocked', path: 'doors.passenger', value: false } },
  { id: 'temperature', name: '分区温度', description: '副驾设置24度', query: '副驾温度调到24度', setup: {}, expect: { status: 'success', path: 'climate.passenger', value: 24 } },
  { id: 'temperature-followup', name: '连续指代', description: '再低一点沿用副驾温度', query: '副驾温度调到24度', turns: ['副驾温度调到24度', '再低一点'], setup: {}, expect: { status: 'success', path: 'climate.passenger', value: 23 } },
  { id: 'speaker', name: '按发话位置控制', description: '二排右侧音区', query: '温度调到22度', setup: { speaker: 'rearRight' }, expect: { status: 'success', path: 'climate.rearRight', value: 22 } },
  { id: 'ambiguous', name: '目标不明时追问', description: '无音区也无指定座位', query: '打开座椅按摩', setup: { speaker: 'unknown' }, expect: { status: 'clarify' } },
  { id: 'target-followup', name: '补充目标后执行', description: '追问后明确副驾', query: '打开座椅按摩', turns: ['打开座椅按摩', '副驾'], setup: { speaker: 'unknown' }, expect: { status: 'success', path: 'seats.passenger.massage', value: true } },
  { id: 'heat-vent', name: '加热通风互斥', description: '开通风后加热归零', query: '副驾座椅通风二挡', turns: ['副驾座椅加热三挡', '副驾座椅通风二挡'], setup: {}, expect: { status: 'success', path: 'seats.passenger.heat', value: 0 } },
  { id: 'third-massage', name: '三排能力边界', description: '未确证的三排按摩不开放', query: '打开三排左侧座椅按摩', setup: {}, expect: { status: 'blocked', path: 'seats.thirdLeft.massage', value: false } },
  { id: 'seat-recline', name: '靠背动作', description: '仅停车时调整', query: '副驾座椅靠背向后躺', setup: {}, expect: { status: 'success', path: 'seats.passenger.recline', value: 0.65 } },
  { id: 'ambient-color', name: '氛围灯颜色', description: '语音设为蓝色', query: '氛围灯调成蓝色', setup: {}, expect: { status: 'success', path: 'lights.color', value: '#8cb5f5' } },
  { id: 'rear-screen', name: '屏幕独立控制', description: '展开不会自动播放', query: '打开后排娱乐屏', setup: {}, expect: { status: 'success', path: 'media.playing', value: false } },
  { id: 'oxygen-unavailable', name: '未启用制氧配置', description: '不把意图识别当执行成功', query: '打开制氧', setup: {}, expect: { status: 'blocked', path: 'oxygen', value: false } },
  { id: 'screen-unavailable', name: '缺少屏幕配置', description: '能力开关关闭即拒绝', query: '打开后排娱乐屏', setup: { capabilities: { rearScreen: false } }, expect: { status: 'blocked', path: 'rearScreen', value: false } },
  { id: 'offline', name: '服务离线', description: '故障不推进车态', query: '打开主驾车窗', setup: { fault: 'offline' }, expect: { status: 'error', path: 'windows.driver', value: 0 } },
  { id: 'execution-failure', name: '工具执行失败', description: '失败不播报成功', query: '副驾温度调到22度', setup: { fault: 'execution' }, expect: { status: 'error', path: 'climate.passenger', value: 24 } },
  { id: 'rest-low-battery', name: '低电量拒绝小憩', description: '20%边界不放行', query: '进入小憩模式', setup: { battery: 20 }, expect: { status: 'blocked', path: 'scene', value: 'normal' } },
  { id: 'rest-window-lock', name: '小憩中门窗限制', description: '先退出小憩再开窗', query: '进入小憩模式', turns: ['进入小憩模式', '打开主驾车窗'], setup: {}, expect: { status: 'blocked', path: 'windows.driver', value: 0 } },
  { id: 'scene-restore', name: '场景退出恢复', description: '恢复进入前的屏幕状态', query: '进入影院模式', turns: ['进入影院模式', '退出影院模式'], setup: {}, expect: { status: 'success', path: 'rearScreen', value: false } },
  { id: 'child-lock', name: '儿童锁门禁', description: '后门从座舱内打开受限', query: '打开左后车门', setup: { childLock: true }, expect: { status: 'blocked', path: 'doors.rearLeft', value: false } },
  { id: 'compound', name: '复合指令', description: '温度和车窗都执行', query: '副驾温度调到22度，然后关闭副驾车窗', setup: { windows: { passenger: 50 } }, expect: { status: 'success', path: 'windows.passenger', value: 0 } },
  { id: 'compound-reject', name: '复合指令完整校验', description: '后半句无效时整条不执行', query: '打开主驾车窗，然后启动飞行模式', setup: {}, expect: { status: 'unsupported', path: 'windows.driver', value: 0 } },
  { id: 'unsupported', name: '未知指令不假成功', description: '不伪造控制能力', query: '把车变成飞机', setup: {}, expect: { status: 'unsupported' } },
];
