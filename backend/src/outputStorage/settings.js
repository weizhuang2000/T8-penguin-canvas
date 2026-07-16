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

function normalizeOutputStorageSpaces(rawSpaces, currentSpaces = []) {
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
    const type = raw.type === 't8-storage-node' ? raw.type : previous.type;
    if (type !== 't8-storage-node') continue;
    result.push({
      id,
      type,
      label: cleanText(raw.label || previous.label || id, 80) || id,
      enabled: raw.enabled === true,
      baseUrl: cleanBaseUrl(raw.baseUrl, previous.baseUrl),
      apiToken: cleanSecret(raw.apiToken, previous.apiToken),
    });
    used.add(id);
  }
  if (result.length === 1) result.push({ ...DEFAULT_REMOTE_OUTPUT_SPACE });
  return result;
}

function normalizeActiveOutputStorageSpaceId(value, spaces) {
  const id = cleanId(value, 'primary');
  const target = (Array.isArray(spaces) ? spaces : []).find((item) => item.id === id);
  if (!target || !target.enabled) return 'primary';
  if (target.type === 't8-storage-node' && (!target.baseUrl || !target.apiToken)) return 'primary';
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
  DEFAULT_REMOTE_OUTPUT_SPACE,
  PRIMARY_OUTPUT_SPACE,
  cleanBaseUrl,
  maskOutputStorageSpaces,
  normalizeActiveOutputStorageSpaceId,
  normalizeOutputStorageSpaces,
  summarizeOutputStorageSpaces,
};
