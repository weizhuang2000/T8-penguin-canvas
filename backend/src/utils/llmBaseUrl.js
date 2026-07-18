function normalizeLlmBaseUrl(value, fallback = '') {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!text) return fallback;
  try {
    const parsed = new URL(text);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return '';
    return text;
  } catch {
    return '';
  }
}

function resolveLlmApiRoot(value, fallback) {
  const base = normalizeLlmBaseUrl(value, fallback) || fallback;
  const parsed = new URL(base);
  let pathname = parsed.pathname.replace(/\/+$/, '');
  pathname = pathname.replace(/\/(?:chat\/completions|responses|images\/(?:generations|edits))$/i, '');
  if (!/\/v1$/i.test(pathname)) pathname = `${pathname}/v1`;
  parsed.pathname = pathname.replace(/\/{2,}/g, '/');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/+$/, '');
}

function resolveLlmChatCompletionsUrl(value, fallback) {
  return `${resolveLlmApiRoot(value, fallback)}/chat/completions`;
}

function resolveLlmImageGenerationsUrl(value, fallback) {
  return `${resolveLlmApiRoot(value, fallback)}/images/generations`;
}

function resolveLlmResponsesUrl(value, fallback) {
  return `${resolveLlmApiRoot(value, fallback)}/responses`;
}

function normalizeLlmModelName(value, fallback = '') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  if (text.length > 240 || /[\u0000-\u001f\u007f]/.test(text)) return '';
  return text;
}

module.exports = {
  normalizeLlmBaseUrl,
  normalizeLlmModelName,
  resolveLlmApiRoot,
  resolveLlmChatCompletionsUrl,
  resolveLlmImageGenerationsUrl,
  resolveLlmResponsesUrl,
};
