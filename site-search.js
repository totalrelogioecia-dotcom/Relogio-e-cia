(() => {
  'use strict';

  const normalize = value => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-‐‑‒–—−]/g, '')
    .toLowerCase()
    .trim();

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  const money = value => Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL'
  });

  let productsPromise = null;
  function loadProducts() {
    if (!productsPromise) {
      productsPromise = fetch('/api/products', { cache: 'no-store' })
        .then(response => {
          if (!response.ok) throw new Error('Não foi possível carregar o catálogo.');
          return response.json();
        })
        .then(items => Array.isArray(items) ? items.filter(p => p?.ativo !== false) : []);
    }
    return productsPromise;
  }

  function scoreProduct(product, query) {
    const q = normalize(query);
    if (!q) return 0;
    const name = normalize(product.nome);
    const sku = normalize(product.sku);
    const brand = normalize(product.marca);
    const category = normalize(product.categoria);
    const desc = normalize(product.desc);

    let score = 0;
    if (sku === q) score += 100;
    if (name === q) score += 90;
    if (sku.startsWith(q)) score += 70;
    if (name.startsWith(q)) score += 60;
    if (name.includes(q)) score += 45;
    if (sku.includes(q)) score += 42;
    if (brand === q) score += 35;
    if (brand.includes(q)) score += 25;
    if (category.includes(q)) score += 15;
    if (desc.includes(q)) score += 8;

    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) {
      const haystack = `${name} ${sku} ${brand} ${category} ${desc}`;
      const matches = tokens.filter(token => haystack.includes(token)).length;
      if (matches === tokens.length) score += 30;
      else score += matches * 4;
    }
    return score;
  }

  function productPhoto(product) {
    return (Array.isArray(product?.fotos) && product.fotos.find(Boolean)) || product?.foto || '';
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
            <p class="site-search-kicker">Catálogo</p>
            <h2 id="site-search-title">O que você procura?</h2>
          </div>
          <button type="button" class="site-search-close" aria-label="Fechar pesquisa">×</button>
        </div>
        <div class="site-search-input-wrap">
          <span aria-hidden="true">⌕</span>
          <input id="site-search-input" type="search" autocomplete="off" spellcheck="false" placeholder="Ex.: F91W, GA2100, G-Shock..." aria-label="Pesquisar por nome, marca ou referência">
          <kbd>ESC</kbd>
        </div>
        <div class="site-search-meta" id="site-search-meta">Pesquise por nome, marca, modelo ou referência.</div>
        <div class="site-search-results" id="site-search-results"></div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#site-search-input');
    const results = overlay.querySelector('#site-search-results');
    const meta = overlay.querySelector('#site-search-meta');
    const close = overlay.querySelector('.site-search-close');
    let debounce = null;

    function openSearch() {
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('site-search-open');
      setTimeout(() => input.focus(), 30);
      loadProducts().catch(() => {});
    }

    function closeSearch() {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('site-search-open');
    }

    async function runSearch() {
      const query = input.value.trim();
      if (!query) {
        meta.textContent = 'Pesquise por nome, marca, modelo ou referência.';
        results.innerHTML = '';
        return;
      }
      meta.textContent = 'Pesquisando no catálogo...';
      try {
        const products = await loadProducts();
        const found = products
          .map(product => ({ product, score: scoreProduct(product, query) }))
          .filter(item => item.score > 0)
          .sort((a, b) => b.score - a.score || Number(a.product.id) - Number(b.product.id))
          .slice(0, 10)
          .map(item => item.product);

        meta.textContent = found.length
          ? `${found.length} resultado${found.length === 1 ? '' : 's'} mais relevante${found.length === 1 ? '' : 's'}`
          : `Nenhum produto encontrado para “${query}”.`;

        results.innerHTML = found.map(product => {
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
      debounce = setTimeout(runSearch, 120);
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
