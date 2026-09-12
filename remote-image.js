const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

async function fetchWithAllowedRedirects(rawUrl, { isAllowed, headers = {}, timeoutMs = 8000, maxRedirects = 3 } = {}) {
  let current = String(rawUrl || '').trim();
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    if (!current || typeof isAllowed !== 'function' || !isAllowed(current)) return null;
    const response = await fetch(current, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirect === maxRedirects) {
        await response.body?.cancel().catch(() => {});
        return null;
      }
      await response.body?.cancel().catch(() => {});
      try { current = new URL(location, current).toString(); }
      catch { return null; }
      continue;
    }

    if (!isAllowed(response.url || current)) return null;
    return response;
  }
  return null;
}

async function readLimitedBody(response, maxBytes = DEFAULT_MAX_BYTES) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    return null;
  }

  if (!response.body?.getReader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length <= maxBytes ? bytes : null;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

async function fetchAllowedImage(rawUrl, options = {}) {
  const response = await fetchWithAllowedRedirects(rawUrl, options);
  if (!response?.ok) {
    await response?.body?.cancel().catch(() => {});
    return null;
  }
  const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(type)) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  const bytes = await readLimitedBody(response, options.maxBytes || DEFAULT_MAX_BYTES);
  return bytes ? { type, bytes } : null;
}

module.exports = {
  ALLOWED_IMAGE_TYPES,
  DEFAULT_MAX_BYTES,
  fetchAllowedImage,
  fetchWithAllowedRedirects,
  readLimitedBody
};
