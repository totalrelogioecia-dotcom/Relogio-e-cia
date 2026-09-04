(() => {
  'use strict';

  if (!document.querySelector('script[data-casio-image-fallback]')) {
    const helper = document.createElement('script');
    helper.src = 'image-proxy-client.js';
    helper.defer = true;
    helper.dataset.casioImageFallback = '1';
    document.head.appendChild(helper);
  }

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  let intelligencePromise = null;
  function loadIntelligence() {
    if (window.RelogioCatalogIntelligence) return Promise.resolve(window.RelogioCatalogIntelligence);
    if (!intelligencePromise) {
      intelligencePromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'catalog-intelligence.js?v=1';
        script.onload = () => resolve(window.RelogioCatalogIntelligence);
        script.onerror = () => reject(new Error('Não foi possível carregar a busca técnica.'));
        document.head.appendChild(script);
      });
    }
    return intelligencePromise;
  }

  let catalogPromise = null;
  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = Promise.all([
        fetch('/api/products', { cache: 'no-store' }).then(response => {
          if (!response.ok) throw new Error('Não foi possível carregar o catálogo.');
          return response.json();
        }),
        fetch('/api/product-details', { cache: 'no-store' }).then(response => response.ok ? response.json() : {})
      ]).then(([products, details]) => ({
        products: Array.isArray(products) ? products.filter(product => product?.ativo !== false) : [],
        details: details && typeof details === 'object' ? details : {}
      }));
    }
    return catalogPromise;
  }

  function productPhoto(product) {
    return (Array.isArray(product?.fotos) && product.fotos.find(Boolean)) || product?.foto || '';
  }

  function queryDescription(parsed) {
    const parts = [];
    const f = parsed?.filters || {};
    if (f.maxPrice != null) parts.push(`até ${money(f.maxPrice)}`);
    if (f.minPrice != null) parts.push(`a partir de ${money(f.minPrice)}`);
    if (f.movement) parts.push(f.movement);
    if (f.color) parts.push(f.color);
    if (f.waterResistance != null) parts.push(`${f.waterResistance} m ou mais`);
    return parts.join(' · ');
  }

  function initSearch() {
    const utility = document.querySelector('.site-header .nav-utility');
    if (!utility || document.getElementById('site-search-button')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'site-search-button';
    button.className = 'nav-icon-link site-search-button';
    button.setAttribute('aria-label', 'Pesquisar produtos');
    button.innerHTML = '<span aria-hidden="true">⌕</span> Buscar';
    utility.prepend(button);

    const overlay = document.createElement('div');
    overlay.className = 'site-search-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="site-search-panel" role="dialog" aria-modal="true" aria-labelledby="site-search-title">
        <div class="site-search-head">
          <div>
            <p class="site-search-kicker">Busca inteligente</p>
            <h2 id="site-search-title">Qual relógio você procura?</h2>
          </div>
          <button type="button" class="site-search-close" aria-label="Fechar pesquisa">×</button>
        </div>
        <div class="site-search-input-wrap">
          <span aria-hidden="true">⌕</span>
          <input id="site-search-input" type="search" autocomplete="off" spellcheck="false" placeholder="Ex.: G-Shock preto até R$ 800, automático, 200 m..." aria-label="Pesquisar por nome, marca, referência, preço ou característica">
          <kbd>ESC</kbd>
        </div>
        <div class="site-search-meta" id="site-search-meta">Entendo nome, marca, referência, faixa de preço e características técnicas cadastradas.</div>
        <div class="site-search-results" id="site-search-results"></div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#site-search-input');
    const results = overlay.querySelector('#site-search-results');
    const meta = overlay.querySelector('#site-search-meta');
    const close = overlay.querySelector('.site-search-close');
    let debounce = null;
    let lastFocus = null;

    function openSearch() {
      lastFocus = document.activeElement;
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('site-search-open');
      setTimeout(() => input.focus(), 30);
      Promise.all([loadCatalog(), loadIntelligence()]).catch(() => {});
    }

    function closeSearch() {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('site-search-open');
      lastFocus?.focus?.();
    }

    async function runSearch() {
      const query = input.value.trim();
      if (!query) {
        meta.textContent = 'Entendo nome, marca, referência, faixa de preço e características técnicas cadastradas.';
        results.innerHTML = '';
        return;
      }
      meta.textContent = 'Analisando o catálogo...';
      try {
        const [{ products, details }, engine] = await Promise.all([loadCatalog(), loadIntelligence()]);
        const parsed = engine.parseQuery(query);
        const found = products
          .map(product => ({ product, ...engine.scoreProduct(product, details[String(product.id)] || {}, parsed) }))
          .filter(item => item.score > 0)
          .sort((a, b) => b.score - a.score || Number(b.product.estoque || 0) - Number(a.product.estoque || 0))
          .slice(0, 12);

        const interpreted = queryDescription(parsed);
        meta.textContent = found.length
          ? `${found.length} resultado${found.length === 1 ? '' : 's'} mais relevante${found.length === 1 ? '' : 's'}${interpreted ? ` · Entendi: ${interpreted}` : ''}`
          : `Nenhum produto encontrado para “${query}”${interpreted ? ` com ${interpreted}` : ''}.`;

        results.innerHTML = found.map(({ product, reasons }) => {
          const photo = productPhoto(product);
          return `
            <a class="site-search-result" href="produto.html?id=${Number(product.id)}">
              <div class="site-search-photo">
                ${photo ? `<img src="${escapeHtml(photo)}" alt="" loading="lazy">` : '<span>Foto em breve</span>'}
              </div>
              <div class="site-search-copy">
                <span>${escapeHtml(product.marca || '')}</span>
                <strong>${escapeHtml(product.nome || 'Produto')}</strong>
                <small>Ref. ${escapeHtml(product.sku || '—')}</small>
                ${reasons?.length ? `<small>${reasons.map(escapeHtml).join(' · ')}</small>` : ''}
              </div>
              <div class="site-search-price">${money(product.preco)}</div>
            </a>`;
        }).join('');
      } catch (error) {
        meta.textContent = error.message || 'Não foi possível pesquisar agora.';
        results.innerHTML = '';
      }
    }

    button.addEventListener('click', openSearch);
    close.addEventListener('click', closeSearch);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeSearch(); });
    input.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(runSearch, 130);
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        const first = results.querySelector('.site-search-result');
        if (first) location.href = first.href;
      }
    });
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
      }
      if (event.key === 'Escape' && overlay.classList.contains('open')) closeSearch();
    });
  }

  document.addEventListener('DOMContentLoaded', initSearch);
})();
