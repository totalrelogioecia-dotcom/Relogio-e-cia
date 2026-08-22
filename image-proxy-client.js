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

  function cleanSku(value) {
    return String(value || '')
      .replace(/^\s*Ref\.\s*/i, '')
      .split('·')[0]
      .trim();
  }

  function skuFromImage(img) {
    const card = img.closest('.product-card');
    const cardSku = card?.querySelector('.sku')?.textContent;
    if (cardSku) return cleanSku(cardSku);

    const cart = img.closest('.cart-item');
    const cartSku = cart?.querySelector('.sku')?.textContent;
    if (cartSku) return cleanSku(cartSku);

    const pageRef = document.querySelector('.product-ref')?.textContent;
    if (pageRef) return cleanSku(pageRef);

    const related = img.closest('a[href*="produto.html?id="]');
    if (related) {
      try {
        const id = Number(new URL(related.href, location.href).searchParams.get('id'));
        if (typeof PRODUTOS !== 'undefined' && Array.isArray(PRODUTOS)) {
          const product = PRODUTOS.find(p => Number(p.id) === id);
          if (product?.sku) return String(product.sku);
        }
      } catch {}
    }
    return '';
  }

  function productResolver(sku) {
    return `/api/product-image?sku=${encodeURIComponent(sku)}`;
  }

  // Captura o erro antes do onerror inline das páginas. Assim a imagem não é
  // removida imediatamente e ainda temos duas tentativas de recuperação.
  document.addEventListener('error', event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;

    const current = img.getAttribute('src') || '';
    const sku = skuFromImage(img);

    if (isCasioUrl(current) && img.dataset.proxyTried !== '1') {
      event.stopImmediatePropagation();
      event.preventDefault();
      img.dataset.proxyTried = '1';
      img.src = proxied(current);
      return;
    }

    if (sku && img.dataset.skuResolverTried !== '1') {
      event.stopImmediatePropagation();
      event.preventDefault();
      img.dataset.skuResolverTried = '1';
      img.src = productResolver(sku);
    }
  }, true);

  function prepare(img) {
    if (!(img instanceof HTMLImageElement) || img.dataset.proxyFallbackReady === '1') return;
    const original = img.getAttribute('src') || '';
    if (!isCasioUrl(original)) return;
    img.dataset.proxyFallbackReady = '1';
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

