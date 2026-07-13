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
  if (price.priceText) return String(price.priceText);
  const numeric = Number(price.price);
  if (!Number.isFinite(numeric)) return '价格以 RunningHub 结算页为准';
  const unit = String(price.unitName || '').trim();
  const mode = String(price.priceMode || '').toUpperCase();
  return `¥${numeric}${unit && mode !== 'FIXED' ? `/${unit}` : ''}`;
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
  const catalog = await fetchRunningHubVideoCatalog(baseUrl);
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
  reviveNuxtPayload,
  findCatalogRecords,
  findCatalogModelDetail,
  priceLabel,
  listRunningHubVideoCatalog,
  resolveRunningHubVideoCatalogModel,
};
