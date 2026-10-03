import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, executeCommand, performAction, TEST_SCENARIOS } from '../engine.js';
import { CAPABILITIES } from '../catalog.js';

const clone = value => structuredClone(value);
function merge(base, override) {
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) base[key] = merge(base[key] || {}, value);
    else base[key] = value;
  }
  return base;
}
function get(object, path) { return path.split('.').reduce((obj, key) => obj?.[key], object); }
function frozen(object) {
  Object.freeze(object);
  Object.values(object).forEach(value => { if (value && typeof value === 'object') frozen(value); });
  return object;
}

for (const scenario of TEST_SCENARIOS) {
  test(`公开演示场景：${scenario.name}`, () => {
    let state = merge(createInitialState(), scenario.setup), context = {};
    let result;
    for (const query of scenario.turns || [scenario.query]) {
      const before = clone(state), oldContext = clone(context);
      result = executeCommand(query, frozen(state), frozen(context));
      assert.deepEqual(state, before, '不得修改输入车辆状态');
      assert.deepEqual(context, oldContext, '不得修改输入会话上下文');
      if (result.status !== 'success') assert.deepEqual(result.state, before, '非成功不得推进车辆状态');
      assert.ok(Array.isArray(result.steps) && result.steps.length >= 3);
      assert.equal(result.evidence, 'adapted');
      state = result.state; context = result.context;
    }
    assert.equal(result.status, scenario.expect.status, `${scenario.name}: ${result.message}`);
    if (scenario.expect.path) assert.deepEqual(get(state, scenario.expect.path), scenario.expect.value);
  });
}

for (const capability of CAPABILITIES) {
  test(`目录示例可执行且目标正确：${capability.title}`, () => {
    const state = createInitialState();
    const result = executeCommand(capability.example, state);
    const expected = capability.domain === 'oxygen' ? 'blocked' : ['door', 'chargePort'].includes(capability.domain) && capability.action.operation === 'open' ? 'clarify' : 'success';
    assert.equal(result.status, expected, `${capability.example}: ${result.message}`);
    assert.equal(result.actions[0]?.domain, capability.action.domain);
    assert.equal(result.actions[0]?.operation, capability.action.operation);
    if (capability.action.target) assert.equal(result.actions[0]?.target, capability.action.target);
  });
}

test('按键与自然语言走同一执行逻辑', () => {
  const a = executeCommand('副驾温度调到22度', createInitialState());
  const b = performAction({ domain: 'temperature', operation: 'set', target: 'passenger', value: 22 }, createInitialState());
  assert.deepEqual(a.state, b.state);
  assert.equal(a.message, b.message);
});

test('确认前重新校验车态：等待时起步不能开门', () => {
  const first = executeCommand('打开副驾车门', createInitialState());
  const changed = { ...first.state, gear: 'D', speed: 10 };
  const final = executeCommand('确认', changed, first.context);
  assert.equal(final.status, 'blocked');
  assert.deepEqual(final.state, changed);
  assert.equal(final.pending, null);
});

test('取消后再次确认不能复活旧任务', () => {
  const first = executeCommand('打开副驾车门', createInitialState());
  const cancel = executeCommand('取消', first.state, first.context);
  const stale = executeCommand('确认', cancel.state, cancel.context);
  assert.equal(stale.status, 'unsupported');
  assert.equal(stale.state.doors.passenger, false);
});

test('新指令替换待确认任务，不能延后误开车门', () => {
  const first = executeCommand('打开副驾车门', createInitialState());
  const next = executeCommand('主驾温度调到23度', first.state, first.context);
  const stale = executeCommand('确认', next.state, next.context);
  assert.equal(stale.status, 'unsupported');
  assert.equal(stale.state.doors.passenger, false);
});

test('复合命令后续失败时全部回滚', () => {
  const initial = createInitialState();
  const result = executeCommand('打开主驾车窗，然后打开制氧', initial);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.state, initial);
});

test('复合命令确认前所有动作都未执行', () => {
  const first = executeCommand('打开主驾车窗，然后打开副驾车门', createInitialState());
  assert.equal(first.status, 'clarify');
  assert.equal(first.state.windows.driver, 0);
  const next = executeCommand('确认', first.state, first.context);
  assert.equal(next.status, 'success');
  assert.equal(next.state.windows.driver, 100);
  assert.equal(next.state.doors.passenger, true);
});

test('指令明确对象优先于音区和上轮目标', () => {
  const state = createInitialState();
  state.speaker = 'rearLeft';
  const result = executeCommand('主驾温度调到22度', state, { lastTarget: 'passenger', lastDomain: 'temperature' });
  assert.equal(result.state.climate.driver, 22);
  assert.equal(result.state.climate.passenger, 24);
  assert.equal(result.state.climate.rearLeft, 24);
});

test('后排两个交互定位同步同一物理温区', () => {
  const first = executeCommand('二排左温度调到22度', createInitialState());
  assert.equal(first.state.climate.rearRight, 22);
  const next = executeCommand('再低一点', first.state, first.context);
  assert.equal(next.state.climate.rearLeft, 21);
  assert.equal(next.state.climate.rearRight, 21);
});

test('相对温度支持中文两度且拒绝越界', () => {
  const first = executeCommand('副驾温度调到十六度', createInitialState());
  const result = executeCommand('再低两度', first.state, first.context);
  assert.equal(result.status, 'blocked');
  assert.equal(result.state.climate.passenger, 16);
});

test('中文数字和小数温度', () => {
  const result = executeCommand('副驾温度调到二十三点五度', createInitialState());
  assert.equal(result.status, 'success');
  assert.equal(result.state.climate.passenger, 23.5);
});

test('风量相对调节有独立上下文', () => {
  const first = executeCommand('风量调到三挡', createInitialState());
  const result = executeCommand('再低一点', first.state, first.context);
  assert.equal(result.status, 'success');
  assert.equal(result.state.climate.fan, 2);
});

test('音量相对调节有独立上下文', () => {
  const first = executeCommand('音量调到30', createInitialState());
  const result = executeCommand('再低一点', first.state, first.context);
  assert.equal(result.state.media.volume, 25);
  assert.equal(result.state.climate.driver, 24);
});

test('阅读灯第三排独立选择', () => {
  const result = executeCommand('打开三排右阅读灯', createInitialState());
  assert.equal(result.state.lights.reading.thirdRight, true);
  assert.equal(result.state.lights.reading.rearRight, false);
});

test('模式退出恢复进入前状态且不覆盖当前环境', () => {
  const original = createInitialState();
  original.media.playing = true;
  original.lights.color = '#123456';
  original.seats.passenger.recline = 0.2;
  const entered = executeCommand('进入小憩模式', original);
  const changed = executeCommand('氛围灯调成蓝色', entered.state, entered.context);
  const current = { ...changed.state, battery: 78, speaker: 'rearRight' };
  const stopped = executeCommand('退出小憩模式', current, changed.context);
  assert.equal(stopped.state.scene, 'normal');
  assert.deepEqual(stopped.state.lights, original.lights);
  assert.deepEqual(stopped.state.seats, original.seats);
  assert.deepEqual(stopped.state.media, original.media);
  assert.equal(stopped.state.battery, 78);
  assert.equal(stopped.state.speaker, 'rearRight');
  assert.equal(stopped.context.sceneSnapshot, undefined);
});

test('情景模式不能相互覆盖', () => {
  const first = executeCommand('进入小憩模式', createInitialState());
  const next = executeCommand('进入影院模式', first.state, first.context);
  assert.equal(next.status, 'blocked');
  assert.deepEqual(next.state, first.state);
});

test('没有后排屏不能进入影院模式', () => {
  const state = createInitialState();
  state.capabilities.rearScreen = false;
  const next = executeCommand('进入影院模式', state);
  assert.equal(next.status, 'blocked');
  assert.deepEqual(next.state, state);
});

test('配置启用后制氧可操作但不假装产生物理效果', () => {
  const state = createInitialState();
  state.capabilities.oxygen = true;
  const next = executeCommand('打开制氧机', state);
  assert.equal(next.status, 'success');
  assert.equal(next.state.oxygen, true);
  assert.equal(next.evidence, 'adapted');
  assert.equal(next.state.oxygenConcentration, undefined);
});

test('返回状态与快照不和输入共享引用', () => {
  const initial = createInitialState();
  const result = executeCommand('打开主驾车窗', initial);
  result.state.windows.passenger = 80;
  result.before.windows.driver = 90;
  assert.equal(initial.windows.driver, 0);
  assert.equal(initial.windows.passenger, 0);
  assert.equal(result.after.windows.passenger, 0);
});

for (const action of [
  { domain: 'window', operation: 'set', target: 'driver', value: NaN },
  { domain: 'window', operation: 'set', target: 'driver', value: Infinity },
  { domain: 'temperature', operation: 'set', target: 'driver', value: '24' },
  { domain: 'seat', operation: 'move', target: 'driver', value: 2 },
  { domain: 'seat', operation: 'recline', target: 'driver', value: -0.1 },
  { domain: 'seat', operation: 'heat', target: 'driver', value: 1.5 },
  { domain: 'seat', operation: 'massage', target: 'driver', value: 'true' },
  { domain: 'fan', operation: 'set', value: -1 },
  { domain: 'media', operation: 'volume', value: 101 },
  { domain: 'ambient', operation: 'color', value: 'blue' },
  { domain: 'climate', operation: 'set', value: 1 },
]) test(`类型及范围保护：${action.domain}.${action.operation}=${String(action.value)}`, () => {
  const state = createInitialState();
  const result = performAction(action, state);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.state, state);
});

for (const command of [
  '打开后视镜加热', '打开方向盘加热', '打开主驾车窗和副驾车窗', '打开主驾车窗和副驾车门',
  '我的车窗打不开', '怎么打开车窗', '打开天窗',
]) test(`含糊或范围外语言不得误控制：${command}`, () => {
  const state = createInitialState();
  const result = executeCommand(command, state);
  assert.notEqual(result.status, 'success');
  assert.deepEqual(result.state, state);
});

test('纯否定指令不误执行', () => {
  const state = createInitialState();
  const result = executeCommand('不要打开副驾车窗', state);
  assert.equal(result.status, 'cancelled');
  assert.deepEqual(result.state, state);
});

for (const command of ['不要进入影院模式', '我不想打开车窗', '不关闭空调', '别播放音乐', '如果下雨打开车窗', '十分钟后打开车窗', '打开主驾车窗副驾车门', '车窗打开负十百分比']) test(`自然语言防误执行：${command}`, () => {
  const state = createInitialState();
  const result = executeCommand(command, state);
  assert.notEqual(result.status, 'success');
  assert.deepEqual(result.state, state);
});

test('操作确认期间变更音区不会偷换最初目标', () => {
  const first = performAction({ domain: 'door', operation: 'open' }, createInitialState());
  const changed = { ...first.state, speaker: 'passenger' };
  const result = executeCommand('确认', changed, first.context);
  assert.equal(result.status, 'success');
  assert.equal(result.state.doors.driver, true);
  assert.equal(result.state.doors.passenger, false);
});

test('明确不同设备的相对语句不得套用旧温度上下文', () => {
  const first = executeCommand('副驾温度调到24度', createInitialState());
  const result = executeCommand('把座舱亮度调高一点', first.state, first.context);
  assert.notEqual(result.status, 'success');
  assert.deepEqual(result.state, first.state);
});

test('三排不是车门和车窗目标', () => {
  for (const domain of ['window', 'door']) {
    const result = performAction({ domain, operation: 'open', target: 'thirdLeft' }, createInitialState());
    assert.equal(result.status, 'blocked');
  }
});

test('批量请求包含不支持座位时不能部分成功', () => {
  const state = createInitialState();
  const result = executeCommand('打开所有座椅按摩', state);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.state, state);
});

test('初始化对象不共享状态', () => {
  const a = createInitialState(), b = createInitialState();
  a.seats.driver.heat = 3;
  a.capabilities.oxygen = true;
  assert.equal(b.seats.driver.heat, 0);
  assert.equal(b.capabilities.oxygen, false);
});

for (const [command, fragment] of [
  ['现在副驾温度多少度', '24 度'], ['左后车窗打开了吗', '车窗已关闭'],
  ['副驾车门关闭了吗', '车门关闭'], ['空调现在是什么状态', '主驾 24 度'],
  ['现在是什么模式', '正常模式'], ['查询车辆状态', '电量 82%'],
  ['后排娱乐屏展开了吗', '已收起'], ['制氧机现在打开了吗', '未启用制氧配置'],
  ['音量多少', '音量 35'],
]) test(`只读状态查询：${command}`, () => {
  const state = frozen(createInitialState());
  const result = executeCommand(command, state);
  assert.equal(result.status, 'success');
  assert.deepEqual(result.state, state);
  assert.equal(result.actions.length, 0);
  assert.equal(result.evidence, 'design');
  assert.match(result.intent, /\.query$/);
  assert.ok(result.message.includes(fragment), result.message);
});

test('温度查询后可以沿用查询对象相对调节', () => {
  const first = executeCommand('副驾现在温度多少', createInitialState());
  const next = executeCommand('再低一点', first.state, first.context);
  assert.equal(next.state.climate.passenger, 23);
  assert.equal(next.state.climate.driver, 24);
});

test('查询缺失目标时追问，补充目标后仍为只读', () => {
  const state = createInitialState(); state.speaker = 'unknown';
  const first = executeCommand('现在温度多少', state);
  assert.equal(first.status, 'clarify');
  const next = executeCommand('副驾', first.state, first.context);
  assert.equal(next.status, 'success');
  assert.equal(next.intent, 'temperature.query');
  assert.deepEqual(next.state, state);
});

test('场景恢复不能重新开启已经移除配置的设备', () => {
  const state = createInitialState(); state.rearScreen = true; state.fragrance = true;
  const first = executeCommand('进入小憩模式', state);
  const changed = clone(first.state);
  changed.capabilities.rearScreen = false;
  changed.capabilities.fragrance = false;
  changed.rearScreen = false;
  changed.fragrance = false;
  const result = executeCommand('退出当前模式', changed, first.context);
  assert.equal(result.status, 'success');
  assert.equal(result.state.rearScreen, false);
  assert.equal(result.state.fragrance, false);
});

test('包含当前二字的退出指令依然执行而非被当成查询', () => {
  const first = executeCommand('进入小憩模式', createInitialState());
  const result = executeCommand('退出当前模式', first.state, first.context);
  assert.equal(result.status, 'success');
  assert.equal(result.state.scene, 'normal');
  assert.equal(result.intent, 'scene.stop');
});
