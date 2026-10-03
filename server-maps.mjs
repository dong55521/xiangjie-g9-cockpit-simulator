// 高德 Web 服务适配；只在服务端读取密钥，不记录请求网址或原始异常。
// 官方接口：https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch
// https://lbs.amap.com/api/webservice/guide/api/newroute
const ORIGIN = 'https://restapi.amap.com';
const TIMEOUT_MS = 15_000, MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const STRATEGIES = new Set([0, 1, 2, ...Array.from({ length: 14 }, (_, i) => i + 32)]);
const MESSAGES = {
  AMAP_NOT_CONFIGURED: '尚未配置高德 Web 服务密钥。',
  INVALID_INPUT: '地图请求参数无效，请检查关键词、城市或经纬度。',
  AMAP_TIMEOUT: '高德地图请求超时，请稍后重试。',
  AMAP_CANCELLED: '地图请求已取消。',
  AMAP_NETWORK_ERROR: '暂时无法连接高德地图，请检查网络后重试。',
  AMAP_HTTP_ERROR: '高德地图服务暂时不可用，请稍后重试。',
  AMAP_INVALID_RESPONSE: '高德返回的数据不完整，暂不能显示可靠结果。',
  AMAP_RESULT_TOO_LARGE: '高德返回的数据过大，请缩小查询范围。',
  NO_ROUTE: '高德未返回可用驾车路线，请更换起点或终点。',
  '10001': '高德密钥不正确或已过期，请检查服务端配置。',
  '10002': '高德密钥没有当前服务的权限，请检查控制台授权。',
  '10003': '高德服务当日调用额度已用完。',
  '10004': '高德请求过于频繁，请稍后重试。',
  '10005': '高德服务端 IP 白名单不匹配，请检查控制台配置。',
  '10006': '高德密钥绑定域名不匹配，请检查控制台配置。',
  '10007': '高德数字签名校验未通过，请检查控制台配置。',
  '10009': '高德密钥与 Web 服务接口平台不匹配，请配置 Web 服务类型密钥。',
  '10012': '高德服务权限不足，请检查控制台授权。',
  '10013': '高德密钥已被删除，请更新服务端配置。',
  '10016': '高德服务繁忙，请稍后重试。',
  '10044': '高德账号当日调用额度已用完。',
  '20000': '高德拒绝了请求参数，请检查地点或坐标。',
  '20001': '高德请求缺少必要参数。',
  '20800': '规划点超出当前高德驾车服务范围。',
  '20801': '高德在规划点附近未找到可行驶道路。',
  '20802': '高德无法连通这两个规划点，请更换位置。',
  '20803': '高德拒绝了过长的路线，请缩短规划距离。',
  '40000': '高德服务余额已耗尽。',
};
class MapFailure extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => ({ ok: false, provider: 'amap', errorCode: code, message: MESSAGES[code] || `高德暂无法完成请求（错误码 ${code}）。` });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keyOf = config => typeof (config?.amap?.webKey ?? config?.amapKey) === 'string' ? (config.amap?.webKey ?? config.amapKey).trim() : '';
const textInput = (value, max) => typeof value === 'string' && value.trim().length > 0 && [...value.trim()].length <= max && !/[\u0000-\u001f\u007f|]/u.test(value);
const coordinate = value => Array.isArray(value) && value.length === 2 && value.every(n => typeof n === 'number' && Number.isFinite(n)) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
const rounded = value => value.map(n => Number(n.toFixed(6)));
function parseCoordinate(value) {
  if (typeof value !== 'string' || value.length > 64) return null;
  const parts = value.split(',').map(part => part.trim());
  if (parts.length !== 2 || parts.some(part => !/^-?\d+(?:\.\d+)?$/.test(part))) return null;
  const pair = parts.map(Number); return coordinate(pair) ? pair : null;
}
function safeText(value, key, max = 256) {
  if (typeof value !== 'string') return '';
  let text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/https?:\/\/\S+/gi, '[外部链接]');
  if (key) text = text.split(key).join('[已隐藏]').split(encodeURIComponent(key)).join('[已隐藏]');
  return text.trim().slice(0, max);
}
function metric(value, max) {
  if (!(typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)))) return null;
  const number = Number(value); return Number.isFinite(number) && number >= 0 && number <= max ? number : null;
}

async function readJson(response) {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) throw new MapFailure('AMAP_RESULT_TOO_LARGE');
  if (!response.body?.getReader) throw new MapFailure('AMAP_INVALID_RESPONSE');
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel().catch(() => {}); throw new MapFailure('AMAP_RESULT_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new MapFailure('AMAP_INVALID_RESPONSE'); }
}

async function request(config, path, parameters, options) {
  const key = keyOf(config);
  if (!key || key.length > 256 || /\s/.test(key)) throw new MapFailure('AMAP_NOT_CONFIGURED');
  if (options.signal?.aborted) throw new MapFailure('AMAP_CANCELLED');
  const controller = new AbortController(); let timer, cancel;
  // 可注入请求函数和更短超时供离线测试；HTTP 请求体不能覆盖这些服务端选项。
  const timeout = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? Math.min(options.timeoutMs, TIMEOUT_MS) : TIMEOUT_MS;
  const guard = new Promise((_, reject) => {
    const abort = code => { controller.abort(); reject(new MapFailure(code)); };
    timer = setTimeout(() => abort('AMAP_TIMEOUT'), timeout);
    cancel = () => abort('AMAP_CANCELLED'); options.signal?.addEventListener('abort', cancel, { once: true });
  });
  try {
    const work = (async () => {
      const url = new URL(path, ORIGIN);
      url.search = new URLSearchParams({ ...parameters, key, output: 'JSON' }).toString();
      const response = await (options.fetchImpl || globalThis.fetch)(url, { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new MapFailure('AMAP_HTTP_ERROR');
      return readJson(response);
    })();
    const data = await Promise.race([work, guard]);
    if (!object(data) || !/^[01]$/.test(String(data.status))) throw new MapFailure('AMAP_INVALID_RESPONSE');
    const code = /^\d{5}$/.test(String(data.infocode)) ? String(data.infocode) : null;
    if (String(data.status) !== '1' || code !== '10000') throw new MapFailure(code && code !== '10000' ? code : 'AMAP_INVALID_RESPONSE');
    return data;
  } catch (error) {
    if (error instanceof MapFailure) throw error;
    throw new MapFailure(options.signal?.aborted ? 'AMAP_CANCELLED' : 'AMAP_NETWORK_ERROR');
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); }
}

export async function searchPlaces(config, args = {}, options = {}) {
  if (!object(args) || Object.keys(args).some(key => !['keywords', 'city'].includes(key)) || !textInput(args.keywords, 80) || (args.city !== undefined && !textInput(args.city, 40))) return fail('INVALID_INPUT');
  try {
    const city = args.city?.trim() || '杭州';
    const data = await request(config, '/v5/place/text', { keywords: args.keywords.trim(), region: city, city_limit: 'true', page_size: '10', page_num: '1' }, options);
    if (!Array.isArray(data.pois) || data.pois.length > 25) throw new MapFailure('AMAP_INVALID_RESPONSE');
    const key = keyOf(config), pois = data.pois.slice(0, 10).flatMap(poi => {
      const location = parseCoordinate(poi?.location), name = safeText(poi?.name, key, 160), id = safeText(poi?.id, key, 128);
      return location && name && id ? [{ id, name, address: safeText(poi.address, key), city: safeText(poi.cityname, key, 80), location }] : [];
    });
    if (data.pois.length && !pois.length) throw new MapFailure('AMAP_INVALID_RESPONSE');
    return { ok: true, provider: 'amap', pois };
  } catch (error) { return fail(error instanceof MapFailure ? error.code : 'AMAP_INVALID_RESPONSE'); }
}

export async function planRoute(config, args = {}, options = {}) {
  const strategy = args?.strategy ?? 32;
  if (!object(args) || Object.keys(args).some(key => !['origin', 'destination', 'strategy'].includes(key)) || !coordinate(args.origin) || !coordinate(args.destination) || !STRATEGIES.has(strategy)) return fail('INVALID_INPUT');
  const origin = rounded(args.origin), destination = rounded(args.destination);
  try {
    const data = await request(config, '/v5/direction/driving', { origin: origin.join(','), destination: destination.join(','), strategy: String(strategy), show_fields: 'cost,polyline', cartype: '1' }, options);
    if (!Array.isArray(data.route?.paths)) throw new MapFailure('AMAP_INVALID_RESPONSE');
    if (!data.route.paths.length) throw new MapFailure('NO_ROUTE');
    if (data.route.paths.length > 5) throw new MapFailure('AMAP_RESULT_TOO_LARGE');
    const key = keyOf(config); let totalPoints = 0;
    const routes = data.route.paths.map((path, index) => {
      const distanceMeters = metric(path.distance, 100_000_000), durationSeconds = metric(path.cost?.duration, 31_536_000);
      if (distanceMeters === null || durationSeconds === null || !Array.isArray(path.steps) || !path.steps.length) throw new MapFailure('AMAP_INVALID_RESPONSE');
      if (path.steps.length > 1000) throw new MapFailure('AMAP_RESULT_TOO_LARGE');
      const polyline = [], steps = path.steps.map(step => {
        if (typeof step.polyline !== 'string') throw new MapFailure('AMAP_INVALID_RESPONSE');
        const points = step.polyline.split(';').filter(value => value.trim());
        totalPoints += points.length; if (totalPoints > 50_000) throw new MapFailure('AMAP_RESULT_TOO_LARGE');
        for (const text of points) {
          const point = parseCoordinate(text); if (!point) throw new MapFailure('AMAP_INVALID_RESPONSE');
          const previous = polyline.at(-1); if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) polyline.push(point);
        }
        const stepDistance = metric(step.step_distance, 100_000_000);
        return { instruction: safeText(step.instruction, key), roadName: safeText(step.road_name, key, 160), ...(stepDistance === null ? {} : { distanceMeters: stepDistance }) };
      });
      if (polyline.length < 2) throw new MapFailure('AMAP_INVALID_RESPONSE');
      return { id: `amap-route-${index + 1}`, distanceMeters, durationSeconds, polyline, steps };
    });
    return { ok: true, provider: 'amap', origin, destination, routes };
  } catch (error) { return fail(error instanceof MapFailure ? error.code : 'AMAP_INVALID_RESPONSE'); }
}
