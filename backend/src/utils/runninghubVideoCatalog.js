const VIDEO_CATEGORIES = new Set([
  'image-to-video',
  'text-to-video',
  'reference-to-video',
  'video-edit',
  'video-to-video',
  'video-extend',
  'motion-control',
  'audio-to-video',
  'video-tools',
]);

const CATALOG_CACHE_MS = 10 * 60 * 1000;
let catalogCache = null;
let catalogCacheAt = 0;

const fallbackItem = (id, name, category, priceLabel) => ({ id, name, category, priceLabel, description: '', highlights: '', price: null });
const FALLBACK_RUNNINGHUB_VIDEO_CATALOG = Object.freeze([
  fallbackItem('2011055907607490562', '全能视频S-角色上传-低价渠道版', 'video-tools', '¥0.05'),
  fallbackItem('2004494607725150210', '全能视频S-图生视频-低价渠道版', 'image-to-video', '¥1'),
  fallbackItem('2012057792137195522', '全能视频S-图生视频-官方稳定版', 'image-to-video', '¥2.28'),
  fallbackItem('2004491650426257409', '全能视频S-图生视频-支持真人-官方稳定版', 'image-to-video', '¥3.2'),
  fallbackItem('2010915780436504578', '全能视频S-图生视频-pro-低价渠道版-已下架', 'image-to-video', '¥1'),
  fallbackItem('2012067220412493826', '全能视频S-图生视频-pro-官方稳定版', 'image-to-video', '¥2.1/秒'),
  fallbackItem('2004499823346368514', '全能视频S-文生视频-低价渠道版', 'text-to-video', '¥1'),
  fallbackItem('2011726198578933762', '全能视频S-文生视频-官方稳定版', 'text-to-video', '¥2.28'),
  fallbackItem('2011003029035495426', '全能视频S-文生视频-pro-低价渠道版-已下架', 'text-to-video', '¥1'),
  fallbackItem('2012065966164602881', '全能视频S-文生视频-pro-官方稳定版', 'text-to-video', '¥2.1/秒'),
  fallbackItem('2054086928526929953', '全能视频V3.1-fast-参考生视频-官方稳定版', 'reference-to-video', '¥4.03'),
  fallbackItem('2022222100292718594', '全能视频V3.1-fast-视频扩展-官方稳定版', 'video-extend', '¥6.56'),
  fallbackItem('2016052223404204034', '全能视频V3.1-fast-首尾帧生视频-低价渠道版', 'image-to-video', '¥1.5'),
  fallbackItem('2005910264819793921', '全能视频V3.1-fast-图生视频-低价渠道版', 'image-to-video', '¥1.5'),
  fallbackItem('2022225870330286082', '全能视频V3.1-fast-图生视频-官方稳定版', 'image-to-video', '¥2.35'),
  fallbackItem('2005884261993070594', '全能视频V3.1-fast-文生视频-低价渠道版', 'text-to-video', '¥1.5'),
  fallbackItem('2022220635650150401', '全能视频V3.1-fast-文生视频-官方稳定版', 'text-to-video', '¥2.35'),
  fallbackItem('2042415417236176904', '全能视频V3.1-Lite首尾帧生视频-官方稳定版', 'image-to-video', '¥2.52'),
  fallbackItem('2042415417236176903', '全能视频V3.1-Lite图生视频-官方稳定版', 'image-to-video', '¥0.32/秒'),
  fallbackItem('2042415417236176902', '全能视频V3.1-Lite文生视频-官方稳定版', 'text-to-video', '¥0.32/秒'),
  fallbackItem('2022221492944916482', '全能视频V3.1-pro-参考生视频-官方稳定版', 'reference-to-video', '¥9.4'),
  fallbackItem('2022226376775716865', '全能视频V3.1-pro-视频扩展-官方稳定版', 'video-extend', '¥17.4'),
  fallbackItem('2018599147311271938', '全能视频V3.1-pro-首尾帧生视频-低价渠道版', 'image-to-video', '¥0.9'),
  fallbackItem('2018518935961669634', '全能视频V3.1-pro-图生视频-低价渠道版', 'image-to-video', '¥0.8'),
  fallbackItem('2022213697642188801', '全能视频V3.1-pro-图生视频-官方稳定版', 'image-to-video', '¥4.7'),
  fallbackItem('2005884653783007234', '全能视频V3.1-pro-文生视频-低价渠道版', 'text-to-video', '¥0.9'),
  fallbackItem('2022195635475992577', '全能视频V3.1-pro-文生视频-官方稳定版', 'text-to-video', '¥4.7'),
  fallbackItem('2028310887460519937', '全能视频X-编辑视频-官方稳定版', 'video-edit', '¥0.41/秒'),
  fallbackItem('2043991611295436802', '全能视频X-多图参考生视频-官方稳定版', 'reference-to-video', '¥1.89'),
  fallbackItem('2043991611295436803', '全能视频X-视频续写-官方稳定版', 'video-extend', '¥1.89'),
  fallbackItem('2019380112598044674', '全能视频X-图生视频-低价渠道版-v1.5', 'image-to-video', '¥0.04/秒'),
  fallbackItem('2028306154142318593', '全能视频X-图生视频-官方稳定版', 'image-to-video', '¥1.89'),
  fallbackItem('2132764885651525688', '全能视频X-图生视频-官方稳定版-v1.5', 'image-to-video', '¥0.56/秒'),
  fallbackItem('2019393210805456897', '全能视频X-文生视频-低价渠道版-v1.5', 'text-to-video', '¥0.04/秒'),
  fallbackItem('2028308297217753089', '全能视频X-文生视频-官方稳定版', 'text-to-video', '¥1.89'),
]);

function reviveNuxtPayload(raw) {
  const values = JSON.parse(raw);
  const cache = new Map();
  const revive = (index) => {
    if (index === -1) return undefined;
    if (typeof index !== 'number') return index;
    if (cache.has(index)) return cache.get(index);
    const value = values[index];
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value) && typeof value[0] === 'string' && ['ShallowReactive', 'Reactive', 'Ref', 'ShallowRef'].includes(value[0])) {
      return revive(value[1]);
    }
    const target = Array.isArray(value) ? [] : {};
    cache.set(index, target);
    if (Array.isArray(value)) value.forEach((item, index2) => { target[index2] = revive(item); });
    else Object.entries(value).forEach(([key, item]) => { target[key] = revive(item); });
    return target;
  };
  return revive(0);
}

function findCatalogRecords(value, visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return null;
  visited.add(value);
  if (Array.isArray(value.records) && value.records.every((item) => item && typeof item.id === 'string')) return value.records;
  for (const child of Object.values(value)) {
    const found = findCatalogRecords(child, visited);
    if (found) return found;
  }
  return null;
}

function findCatalogModelDetail(value, modelId, visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return null;
  visited.add(value);
  if (String(value.id || '') === String(modelId) && typeof value.rhEndpoint === 'string') return value;
  for (const child of Object.values(value)) {
    const found = findCatalogModelDetail(child, modelId, visited);
    if (found) return found;
  }
  return null;
}

function priceLabel(price) {
  if (!price || typeof price !== 'object') return '价格以 RunningHub 结算页为准';
  if (price.isAppFree || price.freeLimit) return '免费';
  const numeric = Number(price.price);
  if (Number.isFinite(numeric)) {
    const unit = String(price.unitName || '').trim();
    const mode = String(price.priceMode || '').toUpperCase();
    return `¥${numeric}${unit && mode !== 'FIXED' ? `/${unit}` : ''}`;
  }
  if (price.priceText) return String(price.priceText);
  return '价格以 RunningHub 结算页为准';
}

function normalizeCatalogRecord(item) {
  return {
    id: String(item.id),
    name: String(item.name || item.id),
    category: String(item.categoryName || ''),
    description: String(item.description || ''),
    highlights: String(item.modelHighlights || ''),
    priceLabel: priceLabel(item.price),
    price: item.price || null,
  };
}

function extractNuxtPayload(html) {
  const match = String(html || '').match(/<script\s+id=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('无法读取 RunningHub 标准模型目录');
  return match[1];
}

async function fetchRunningHubVideoCatalog(baseUrl) {
  const root = String(baseUrl || 'https://www.runninghub.cn').replace(/\/+$/, '');
  const response = await fetch(`${root}/call-api/search-api/standard-model?search=${encodeURIComponent('全能视频')}`, {
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  if (!response.ok) throw new Error(`读取 RunningHub 标准模型目录失败 HTTP ${response.status}`);
  const payload = reviveNuxtPayload(extractNuxtPayload(await response.text()));
  const records = findCatalogRecords(payload);
  if (!records) throw new Error('RunningHub 标准模型目录格式异常');
  return records
    .filter((item) => VIDEO_CATEGORIES.has(String(item.categoryName || '')) && String(item.name || '').includes('全能视频'))
    .map(normalizeCatalogRecord)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

async function listRunningHubVideoCatalog(baseUrl, { force = false } = {}) {
  if (!force && catalogCache && Date.now() - catalogCacheAt < CATALOG_CACHE_MS) return catalogCache;
  let catalog;
  try {
    catalog = await fetchRunningHubVideoCatalog(baseUrl);
  } catch (error) {
    console.warn('RunningHub 视频目录在线刷新失败，使用内置快照:', error?.message || error);
    catalog = FALLBACK_RUNNINGHUB_VIDEO_CATALOG.map((item) => ({ ...item }));
  }
  catalogCache = catalog;
  catalogCacheAt = Date.now();
  return catalog;
}

async function resolveRunningHubVideoCatalogModel(baseUrl, modelId) {
  const id = String(modelId || '').trim();
  if (!/^\d{12,24}$/.test(id)) throw new Error('无效的 RunningHub 视频模型 ID');
  const catalog = await listRunningHubVideoCatalog(baseUrl);
  const model = catalog.find((item) => item.id === id);
  if (!model) throw new Error('该模型不在 RunningHub 视频模型目录中');
  const root = String(baseUrl || 'https://www.runninghub.cn').replace(/\/+$/, '');
  const response = await fetch(`${root}/call-api/api-detail/${id}`, {
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  if (!response.ok) throw new Error(`读取 RunningHub 模型接口失败 HTTP ${response.status}`);
  const detail = findCatalogModelDetail(reviveNuxtPayload(extractNuxtPayload(await response.text())), id);
  const path = String(detail?.rhEndpoint || '').trim();
  if (!/^\/[A-Za-z0-9._/-]+$/.test(path)) throw new Error('未能识别 RunningHub 模型调用接口');
  const endpoint = path.startsWith('/openapi/') || path.startsWith('/v1/') ? path : `/openapi/v2${path}`;
  let inputConfig = [];
  try {
    inputConfig = JSON.parse(String(detail?.inputConfigJson || '[]'));
  } catch {}
  return { ...model, endpoint, inputConfig };
}

module.exports = {
  VIDEO_CATEGORIES,
  FALLBACK_RUNNINGHUB_VIDEO_CATALOG,
  reviveNuxtPayload,
  findCatalogRecords,
  findCatalogModelDetail,
  priceLabel,
  listRunningHubVideoCatalog,
  resolveRunningHubVideoCatalogModel,
};
