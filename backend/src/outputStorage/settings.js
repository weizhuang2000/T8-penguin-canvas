'use strict';

const SPACE_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

const PRIMARY_OUTPUT_SPACE = Object.freeze({
  id: 'primary',
  type: 'local',
  label: '当前服务器',
  enabled: true,
  immutable: true,
});

const DEFAULT_REMOTE_OUTPUT_SPACE = Object.freeze({
  id: 'ecs-secondary',
  type: 't8-storage-node',
  label: '第二台 ECS',
  enabled: false,
  baseUrl: '',
  apiToken: '',
});

const BAIDU_OUTPUT_SPACE_ID = 'cloud-baidu-netdisk';

function cleanText(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanId(value, fallback = '') {
  const id = String(value || '').trim().toLowerCase();
  return SPACE_ID_RE.test(id) ? id : fallback;
}

function isMaskedSecret(value) {
  return typeof value === 'string' && /^\*{2,}/.test(value.trim());
}

function cleanSecret(value, previous = '') {
  if (typeof value !== 'string') return previous || '';
  const text = value.trim();
  if (!text || isMaskedSecret(text) || /[\x00-\x1f\x7f]/.test(text)) return previous || '';
  return text.slice(0, 8192);
}

function maskSecret(value) {
  const text = String(value || '').trim();
  return text ? `****${text.slice(-4)}` : '';
}

function cleanBaseUrl(value, fallback = '') {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!text) return fallback || '';
  try {
    const url = new URL(text);
    const localHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !localHttp) return fallback || '';
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '').slice(0, 500);
  } catch {
    return fallback || '';
  }
}

function normalizeOutputStorageSpaces(rawSpaces, currentSpaces = [], cloudTargets = null) {
  const current = Array.isArray(currentSpaces) ? currentSpaces : [];
  const currentById = new Map(current.map((item) => [cleanId(item?.id), item]));
  const incoming = Array.isArray(rawSpaces) ? rawSpaces : [];
  const result = [{ ...PRIMARY_OUTPUT_SPACE }];
  const used = new Set(['primary']);

  const source = incoming.length
    ? incoming
    : (current.length ? current : [DEFAULT_REMOTE_OUTPUT_SPACE]);
  for (const raw of source) {
    if (!raw || typeof raw !== 'object') continue;
    const id = cleanId(raw.id);
    if (!id || id === 'primary' || used.has(id)) continue;
    const previous = currentById.get(id) || {};
    const type = ['t8-storage-node', 'cloud-upload-target'].includes(raw.type) ? raw.type : previous.type;
    if (type === 't8-storage-node') {
      result.push({
        id,
        type,
        label: cleanText(raw.label || previous.label || id, 80) || id,
        enabled: raw.enabled === true,
        baseUrl: cleanBaseUrl(raw.baseUrl, previous.baseUrl),
        apiToken: cleanSecret(raw.apiToken, previous.apiToken),
      });
    } else if (type === 'cloud-upload-target') {
      result.push({
        id,
        type,
        label: cleanText(raw.label || previous.label || id, 80) || id,
        enabled: raw.enabled === true,
        cloudTargetId: cleanId(raw.cloudTargetId || previous.cloudTargetId),
        provider: raw.provider === 'baidu-netdisk' ? 'baidu-netdisk' : previous.provider,
        managed: true,
      });
    } else continue;
    used.add(id);
  }
  if (result.length === 1) result.push({ ...DEFAULT_REMOTE_OUTPUT_SPACE });
  if (Array.isArray(cloudTargets)) {
    const target = cloudTargets.find((item) => item?.id === 'baidu-netdisk' || item?.provider === 'baidu-netdisk');
    const cfg = target?.baiduNetdisk || {};
    const derived = {
      id: BAIDU_OUTPUT_SPACE_ID,
      type: 'cloud-upload-target',
      label: cleanText(target?.label || '百度网盘', 80) || '百度网盘',
      enabled: target?.enabled === true && !!String(cfg.webdavUrl || '').trim(),
      cloudTargetId: target?.id || 'baidu-netdisk',
      provider: 'baidu-netdisk',
      managed: true,
    };
    const existingIndex = result.findIndex((item) => item.id === BAIDU_OUTPUT_SPACE_ID);
    if (existingIndex >= 0) result[existingIndex] = derived;
    else result.push(derived);
  }
  return result;
}

function normalizeActiveOutputStorageSpaceId(value, spaces) {
  const id = cleanId(value, 'primary');
  const target = (Array.isArray(spaces) ? spaces : []).find((item) => item.id === id);
  if (!target || !target.enabled) return 'primary';
  if (target.type === 't8-storage-node' && (!target.baseUrl || !target.apiToken)) return 'primary';
  if (target.type === 'cloud-upload-target' && (!target.cloudTargetId || target.provider !== 'baidu-netdisk')) return 'primary';
  return target.id;
}

function maskOutputStorageSpaces(spaces) {
  return normalizeOutputStorageSpaces(spaces, spaces).map((space) => (
    space.type === 't8-storage-node'
      ? { ...space, apiToken: maskSecret(space.apiToken), hasApiToken: !!space.apiToken }
      : space
  ));
}

function summarizeOutputStorageSpaces(spaces, activeId) {
  const normalized = normalizeOutputStorageSpaces(spaces, spaces);
  const active = normalizeActiveOutputStorageSpaceId(activeId, normalized);
  return {
    totalCount: normalized.length,
    enabledCount: normalized.filter((item) => item.enabled).length,
    activeSpaceId: active,
    activeLabel: normalized.find((item) => item.id === active)?.label || PRIMARY_OUTPUT_SPACE.label,
  };
}

module.exports = {
  BAIDU_OUTPUT_SPACE_ID,
  DEFAULT_REMOTE_OUTPUT_SPACE,
  PRIMARY_OUTPUT_SPACE,
  cleanBaseUrl,
  maskOutputStorageSpaces,
  normalizeActiveOutputStorageSpaceId,
  normalizeOutputStorageSpaces,
  summarizeOutputStorageSpaces,
};
