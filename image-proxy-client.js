(() => {
  'use strict';

  function isCasioUrl(value) {
    try {
      const u = new URL(String(value || ''), location.href);
      return u.protocol === 'https:' && u.hostname === 'www.casio.com' && u.pathname.startsWith('/content/dam/casio/');
    } catch { return false; }
  }

  function proxied(value) {
    return `/api/image-proxy?url=${encodeURIComponent(value)}`;
  }

  function prepare(img) {
    if (!(img instanceof HTMLImageElement) || img.dataset.proxyFallbackReady === '1') return;
    const original = img.getAttribute('src') || '';
    if (!isCasioUrl(original)) return;
    img.dataset.proxyFallbackReady = '1';
    img.addEventListener('error', () => {
      if (img.dataset.proxyTried === '1') return;
      img.dataset.proxyTried = '1';
      img.src = proxied(original);
    });
  }

  document.querySelectorAll('img').forEach(prepare);
  new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (node instanceof HTMLImageElement) prepare(node);
        if (node instanceof Element) node.querySelectorAll?.('img').forEach(prepare);
      });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
