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

function resolveLlmChatCompletionsUrl(value, fallback) {
  const base = normalizeLlmBaseUrl(value, fallback) || fallback;
  const parsed = new URL(base);
  const normalizedBase = parsed.toString().replace(/\/+$/, '');
  return /\/v1$/i.test(parsed.pathname.replace(/\/+$/, ''))
    ? `${normalizedBase}/chat/completions`
    : `${normalizedBase}/v1/chat/completions`;
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
  resolveLlmChatCompletionsUrl,
};
