const { fetchWithAllowedRedirects, readLimitedBody } = require('./remote-image');

const DEFAULT_MAX_TEXT_BYTES = 4 * 1024 * 1024;

async function cancelBody(response) {
  try { await response?.body?.cancel(); } catch {}
}

async function fetchAllowedText(rawUrl, options = {}) {
  const response = await fetchWithAllowedRedirects(rawUrl, options);
  if (!response?.ok) {
    await cancelBody(response);
    return null;
  }

  const type = String(response.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const allowedTypes = new Set(options.allowedTypes || ['text/html']);
  if (!allowedTypes.has(type)) {
    await cancelBody(response);
    return null;
  }

  const bytes = await readLimitedBody(
    response,
    options.maxBytes || DEFAULT_MAX_TEXT_BYTES
  );
  if (!bytes) return null;

  return {
    response,
    type,
    text: bytes.toString(options.encoding || 'utf8')
  };
}

module.exports = {
  DEFAULT_MAX_TEXT_BYTES,
  fetchAllowedText
};
