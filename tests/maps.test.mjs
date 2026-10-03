import test from 'node:test';
import assert from 'node:assert/strict';
import { searchPlaces, planRoute } from '../server-maps.mjs';

// 全部为离线响应模拟，不使用本地真实密钥；真实验证另记 docs/api-verification.json。
const SECRET = 'test-only-secret-not-a-real-amap-key';
const config = { amap: { webKey: SECRET } };
const routeArgs = { origin: [120.212, 30.291], destination: [120.149, 30.251] };
const poi = { id: 'B_TEST', name: '西湖测试点', address: '测试地址', cityname: '杭州市', location: '120.149,30.251' };
const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const searchResponse = (pois = [poi]) => ({ status: '1', infocode: '10000', pois });
const routeResponse = () => ({ status: '1', infocode: '10000', route: { paths: [{
  distance: '12345', cost: { duration: '1860' }, steps: [
    { instruction: '向前行驶', road_name: '测试路', step_distance: '4000', polyline: '120.212,30.291;120.18,30.27' },
    { instruction: '到达测试终点', road_name: '测试路二', step_distance: '8345', polyline: '120.18,30.27;120.149,30.251' },
  ],
}] } });
const stub = data => ({ fetchImpl: async () => json(data) });
function noSecret(value) { const text = JSON.stringify(value); assert(!text.includes(SECRET)); assert(!text.includes('restapi.amap.com')); }

test('地点搜索：使用v5接口和默认杭州，返回白名单字段及真实坐标', async () => {
  let calls = 0;
  const result = await searchPlaces(config, { keywords: ' 西湖 ' }, { fetchImpl: async (url, options) => {
    calls++; assert.equal(url.origin, 'https://restapi.amap.com'); assert.equal(url.pathname, '/v5/place/text');
    assert.equal(url.searchParams.get('region'), '杭州'); assert.equal(url.searchParams.get('keywords'), '西湖');
    assert.equal(url.searchParams.get('key'), SECRET); assert.equal(options.redirect, 'error');
    return json(searchResponse([{ ...poi, key: SECRET, extra: '不应返回' }]));
  } });
  assert.equal(calls, 1); assert.deepEqual(result, { ok: true, provider: 'amap', pois: [{ id: 'B_TEST', name: poi.name, address: poi.address, city: '杭州市', location: [120.149, 30.251] }] }); noSecret(result);
});

test('地点搜索：支持显式城市，空结果保持空且不补示例地点', async () => {
  const result = await searchPlaces(config, { keywords: '未命中测试', city: '宁波' }, { fetchImpl: async url => {
    assert.equal(url.searchParams.get('region'), '宁波'); assert.equal(url.searchParams.get('city_limit'), 'true'); return json(searchResponse([]));
  } });
  assert.deepEqual(result, { ok: true, provider: 'amap', pois: [] });
});

test('输入验证：拒绝无效关键词、超长内容、未知参数和无效城市且不发请求', async () => {
  let calls = 0; const options = { fetchImpl: async () => { calls++; throw new Error('不应请求'); } };
  for (const args of [null, [], {}, { keywords: '' }, { keywords: 'x'.repeat(81) }, { keywords: '西湖|酒店' }, { keywords: '西湖\n' }, { keywords: '西湖', city: '' }, { keywords: '西湖', city: 'x'.repeat(41) }, { keywords: '西湖', endpoint: 'https://example.invalid' }]) {
    assert.equal((await searchPlaces(config, args, options)).errorCode, 'INVALID_INPUT');
  }
  assert.equal(calls, 0);
});

test('输入验证：拒绝越界、非数值、过长坐标和不支持的路线策略', async () => {
  let calls = 0; const options = { fetchImpl: async () => { calls++; } };
  for (const origin of [[181, 30], [120, 91], [NaN, 30], [Infinity, 30], ['120', 30], [120], [120, 30, 0], '120,30', [null, 30]]) {
    assert.equal((await planRoute(config, { ...routeArgs, origin }, options)).errorCode, 'INVALID_INPUT');
  }
  for (const strategy of [-1, 3, 31, 46, '32', {}, 32.5]) assert.equal((await planRoute(config, { ...routeArgs, strategy }, options)).errorCode, 'INVALID_INPUT');
  assert.equal(calls, 0);
});

test('未配置密钥：返回明确错误且不请求第三方', async () => {
  let called = false;
  const result = await searchPlaces({}, { keywords: '西湖' }, { fetchImpl: async () => { called = true; } });
  assert.equal(result.errorCode, 'AMAP_NOT_CONFIGURED'); assert.equal(called, false);
});

test('高德10009：保留平台不匹配错误，不回显原始信息或密钥', async () => {
  const response = { status: '0', infocode: '10009', info: `https://restapi.amap.com/?key=${SECRET}`, key: SECRET };
  for (const result of [await searchPlaces(config, { keywords: '西湖' }, stub(response)), await planRoute(config, routeArgs, stub(response))]) {
    assert.equal(result.ok, false); assert.equal(result.errorCode, '10009'); assert.match(result.message, /平台不匹配/); noSecret(result);
  }
});

test('错误处理：未知错误码可见，恶意错误码不能注入响应', async () => {
  const unknown = await searchPlaces(config, { keywords: '西湖' }, stub({ status: '0', infocode: '30099', info: SECRET }));
  assert.equal(unknown.errorCode, '30099'); noSecret(unknown);
  const bad = await searchPlaces(config, { keywords: '西湖' }, stub({ status: '0', infocode: SECRET, info: SECRET }));
  assert.equal(bad.errorCode, 'AMAP_INVALID_RESPONSE'); noSecret(bad);
});

test('异常响应：HTTP失败、非JSON和畸形地点不伪装成功', async () => {
  const options = [
    { fetchImpl: async () => new Response(SECRET, { status: 503 }) },
    { fetchImpl: async () => new Response(`<html>${SECRET}</html>`) },
    stub({ status: '1', infocode: '10000' }),
    stub(searchResponse([{ ...poi, location: ',30' }])),
    stub(searchResponse([{ ...poi, location: '181,30' }])),
  ];
  for (const option of options) { const result = await searchPlaces(config, { keywords: '西湖' }, option); assert.equal(result.ok, false); noSecret(result); }
});

test('响应字段：上游意外回显密钥和网址时仍不会泄露', async () => {
  const result = await searchPlaces(config, { keywords: '西湖' }, stub(searchResponse([{ ...poi, name: `测试 ${SECRET}`, address: `https://restapi.amap.com/?key=${SECRET}` }])));
  assert.equal(result.ok, true); assert.match(result.pois[0].name, /已隐藏/); noSecret(result);
});

test('路线规划：读取v5 cost和分段polyline，合并相邻重复点而不编造线路', async () => {
  const result = await planRoute(config, { ...routeArgs, origin: [120.212123456, 30.291123456], strategy: 33 }, { fetchImpl: async url => {
    assert.equal(url.pathname, '/v5/direction/driving'); assert.equal(url.searchParams.get('show_fields'), 'cost,polyline');
    assert.equal(url.searchParams.get('origin'), '120.212123,30.291123'); assert.equal(url.searchParams.get('strategy'), '33'); return json(routeResponse());
  } });
  assert.equal(result.ok, true); assert.equal(result.routes.length, 1);
  assert.equal(result.routes[0].distanceMeters, 12345); assert.equal(result.routes[0].durationSeconds, 1860);
  assert.deepEqual(result.routes[0].polyline, [[120.212, 30.291], [120.18, 30.27], [120.149, 30.251]]);
  assert.deepEqual(result.origin, [120.212123, 30.291123]); assert.equal(result.routes[0].steps.length, 2); noSecret(result);
});

test('路线规划：空路线、缺少耗时或破损折线返回失败', async () => {
  const none = await planRoute(config, routeArgs, stub({ status: '1', infocode: '10000', route: { paths: [] } }));
  assert.equal(none.errorCode, 'NO_ROUTE');
  for (const corrupt of [data => delete data.route.paths[0].cost, data => { data.route.paths[0].steps[0].polyline = '120.2,30.2;坏坐标'; }, data => { data.route.paths[0].distance = ''; }]) {
    const data = routeResponse(); corrupt(data); const result = await planRoute(config, routeArgs, stub(data)); assert.equal(result.errorCode, 'AMAP_INVALID_RESPONSE');
  }
});

test('请求超时：限时返回并取消上游，不依赖上游主动完成', async () => {
  let signal;
  const result = await searchPlaces(config, { keywords: '西湖' }, { timeoutMs: 10, fetchImpl: async (_, options) => { signal = options.signal; return new Promise(() => {}); } });
  assert.equal(result.errorCode, 'AMAP_TIMEOUT'); assert.equal(signal.aborted, true); noSecret(result);
});

test('取消请求：预取消不联网，运行中取消终止上游', async () => {
  const pre = new AbortController(); pre.abort(); let calls = 0;
  assert.equal((await searchPlaces(config, { keywords: '西湖' }, { signal: pre.signal, fetchImpl: async () => { calls++; } })).errorCode, 'AMAP_CANCELLED'); assert.equal(calls, 0);
  const controller = new AbortController(); let upstream;
  const pending = searchPlaces(config, { keywords: '西湖' }, { signal: controller.signal, fetchImpl: async (_, options) => { upstream = options.signal; return new Promise(() => {}); } });
  controller.abort(); assert.equal((await pending).errorCode, 'AMAP_CANCELLED'); assert.equal(upstream.aborted, true);
});

test('网络异常：拒绝原始异常文本，避免网址和密钥进入返回值', async () => {
  const result = await planRoute(config, routeArgs, { fetchImpl: async () => { throw new Error(`连接 https://restapi.amap.com/?key=${SECRET} 失败`); } });
  assert.equal(result.errorCode, 'AMAP_NETWORK_ERROR'); noSecret(result);
});

test('响应限额：拒绝过大的声明长度和实际流体积', async () => {
  const declared = await searchPlaces(config, { keywords: '西湖' }, { fetchImpl: async () => new Response('{}', { headers: { 'content-length': String(3 * 1024 * 1024) } }) });
  assert.equal(declared.errorCode, 'AMAP_RESULT_TOO_LARGE');
  const streamed = await searchPlaces(config, { keywords: '西湖' }, { fetchImpl: async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)) });
  assert.equal(streamed.errorCode, 'AMAP_RESULT_TOO_LARGE');
});
