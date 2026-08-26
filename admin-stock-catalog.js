(function () {
  'use strict';

  const TOKEN_KEY = 'reloja_admin_token';
  const $ = selector => document.querySelector(selector);
  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  let timer = null;
  let lastController = null;
  let currentProducts = [];

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function escAttr(value) {
    return esc(value).replace(/`/g, '&#96;');
  }

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function ensureStyles() {
    if ($('#stock-catalog-styles')) return;
    const style = document.createElement('style');
    style.id = 'stock-catalog-styles';
    style.textContent = `
      .stock-catalog-card{margin:0 0 22px;padding:18px;border:1px solid #ddd;background:#faf9f6}
      .stock-catalog-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:14px}
      .stock-catalog-head h3{margin:0 0 5px}.stock-catalog-head p{margin:0;color:#666;font-size:12px;line-height:1.5;max-width:760px}
      .stock-catalog-search{display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:10px}
      .stock-catalog-search input,.stock-catalog-search select{width:100%;min-height:42px;border:1px solid #bbb;background:#fff;padding:0 12px;font:inherit}
      .stock-catalog-status{min-height:20px;margin-top:8px;font-size:12px;color:#666}
      .stock-catalog-results{margin-top:12px;overflow:auto}.stock-catalog-results table{margin:0;min-width:760px}
      .stock-catalog-product{display:flex;align-items:center;gap:10px}.stock-catalog-thumb{width:52px;height:52px;object-fit:contain;background:#fff;border:1px solid #e2e2e2;flex:0 0 auto}
      .stock-catalog-placeholder{padding:18px;border:1px dashed #ccc;background:#fff;color:#666;font-size:13px}
      .stock-catalog-badge{display:inline-block;padding:4px 7px;border:1px solid #cfcfcf;background:#fff;font-size:11px;white-space:nowrap}
      .stock-catalog-badge.in{border-color:#83bd98;color:#087d3e}.stock-catalog-badge.out{border-color:#d6a4a4;color:#9a2525}.stock-catalog-badge.hidden{border-color:#bbb;color:#666}
      .stock-catalog-counts{font-size:11px;color:#777;white-space:nowrap}
      @media(max-width:720px){.stock-catalog-head{display:block}.stock-catalog-counts{margin-top:8px}.stock-catalog-search{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureBox() {
    const tab = $('#tab-produtos');
    const toolbar = tab?.querySelector('.admin-toolbar');
    if (!tab || !toolbar || $('#stock-catalog-box')) return;

    ensureStyles();
    const box = document.createElement('section');
    box.id = 'stock-catalog-box';
    box.className = 'stock-catalog-card';
    box.innerHTML = `
      <div class="stock-catalog-head">
        <div>
          <h3>Pesquisa de estoque</h3>
          <p>Pesquise os produtos cadastrados por referência, nome ou marca. Produtos sem estoque continuam pesquisáveis e produtos ocultos permanecem disponíveis para edição no painel.</p>
        </div>
        <div id="stock-catalog-counts" class="stock-catalog-counts"></div>
      </div>
      <div class="stock-catalog-search">
        <input id="stock-catalog-query" type="search" autocomplete="off" placeholder="Ex.: GA-2100, Orient, Citizen...">
        <select id="stock-catalog-filter" aria-label="Filtrar estoque">
          <option value="todos">Todos</option>
          <option value="em_estoque">Em estoque</option>
          <option value="sem_estoque">Sem estoque</option>
          <option value="oculto">Ocultos</option>
        </select>
      </div>
      <div id="stock-catalog-status" class="stock-catalog-status">Digite pelo menos 2 caracteres para pesquisar ou escolha um filtro.</div>
      <div id="stock-catalog-results" class="stock-catalog-results"><div class="stock-catalog-placeholder">A pesquisa usa somente o estoque real da loja.</div></div>`;
    const editor = $('#product-editor');
    if (editor) editor.insertAdjacentElement('afterend', box);
    else toolbar.insertAdjacentElement('afterend', box);

    $('#stock-catalog-query').addEventListener('input', scheduleSearch);
    $('#stock-catalog-filter').addEventListener('change', () => runSearch(true));
    document.addEventListener('click', handleAction);
  }

  function authHeaders() {
    const headers = { Accept: 'application/json' };
    if (token()) headers.Authorization = `Bearer ${token()}`;
    return headers;
  }

  function productStatus(product) {
    if (product?.ativo === false) return 'oculto';
    return Number(product?.estoque || 0) > 0 ? 'em_estoque' : 'sem_estoque';
  }

  function statusLabel(product) {
    const status = productStatus(product);
    if (status === 'em_estoque') return ['Em estoque', 'in'];
    if (status === 'sem_estoque') return ['Sem estoque', 'out'];
    return ['Oculto', 'hidden'];
  }

  function scheduleSearch() {
    clearTimeout(timer);
    timer = setTimeout(() => runSearch(false), 220);
  }

  async function runSearch(force) {
    const query = String($('#stock-catalog-query')?.value || '').trim();
    const filter = $('#stock-catalog-filter')?.value || 'todos';
    const status = $('#stock-catalog-status');
    const results = $('#stock-catalog-results');

    if (!force && query.length < 2) {
      status.textContent = 'Digite pelo menos 2 caracteres para pesquisar ou escolha um filtro.';
      results.innerHTML = '<div class="stock-catalog-placeholder">A pesquisa usa somente o estoque real da loja.</div>';
      return;
    }

    if (lastController) lastController.abort();
    lastController = new AbortController();
    status.textContent = 'Pesquisando...';

    try {
      const response = await fetch('/api/admin/products', {
        cache: 'no-store', credentials: 'same-origin', signal: lastController.signal, headers: authHeaders()
      });
      const products = await response.json().catch(() => []);
      if (response.status === 401) throw new Error('Sua sessão administrativa expirou. Entre novamente no painel.');
      if (!response.ok || !Array.isArray(products)) throw new Error('Não foi possível pesquisar o estoque.');
      currentProducts = products;

      const q = normalize(query);
      const compact = q.replace(/\s+/g, '');
      const filtered = products.filter(product => {
        const productState = productStatus(product);
        if (filter !== 'todos' && productState !== filter) return false;
        if (!q) return true;
        const sku = String(product.sku || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const searchable = normalize(`${product.sku || ''} ${product.nome || ''} ${product.marca || ''}`);
        return searchable.includes(q) || sku.includes(compact);
      }).sort((a, b) => {
        const aSku = String(a.sku || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const bSku = String(b.sku || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const exactA = compact && aSku === compact ? 1 : 0;
        const exactB = compact && bSku === compact ? 1 : 0;
        return exactB - exactA || String(a.marca || '').localeCompare(String(b.marca || ''), 'pt-BR') || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
      });

      render(filtered.slice(0, 50), products.length, filtered.length);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      status.textContent = error.message || 'Não foi possível pesquisar o estoque.';
      results.innerHTML = '<div class="stock-catalog-placeholder">Tente novamente.</div>';
    }
  }

  function render(items, storeTotal, matchTotal) {
    const status = $('#stock-catalog-status');
    const results = $('#stock-catalog-results');
    const counts = $('#stock-catalog-counts');
    counts.textContent = `${Number(storeTotal || 0)} produtos cadastrados`;
    status.textContent = `${Number(matchTotal || 0)} resultado(s). Mostrando até 50 por pesquisa.`;

    if (!items.length) {
      results.innerHTML = '<div class="stock-catalog-placeholder">Nenhum produto encontrado com esse filtro.</div>';
      return;
    }

    results.innerHTML = `<table class="admin-table"><thead><tr><th>Produto</th><th>Referência</th><th>Status</th><th>Estoque</th><th>Ações</th></tr></thead><tbody>${items.map(product => {
      const [label, css] = statusLabel(product);
      const photoUrl = Array.isArray(product.fotos) ? product.fotos.find(Boolean) : product.foto;
      const photo = photoUrl ? `<img class="stock-catalog-thumb" src="${escAttr(photoUrl)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '';
      return `<tr><td><div class="stock-catalog-product">${photo}<div><strong>${esc(product.nome || product.sku)}</strong><br><small>${esc(product.marca || '')}</small></div></div></td><td>${esc(product.sku || '')}</td><td><span class="stock-catalog-badge ${css}">${label}</span></td><td>${Math.max(0,Number(product.estoque||0))}</td><td><div class="admin-actions"><button type="button" data-stock-edit="${escAttr(product.id)}">Editar produto</button></div></td></tr>`;
    }).join('')}</tbody></table>`;
  }

  function handleAction(event) {
    const edit = event.target.closest('[data-stock-edit]');
    if (!edit) return;
    event.preventDefault();
    const id = String(edit.dataset.stockEdit || '');
    const existing = document.querySelector(`#products-list [data-edit="${CSS.escape(id)}"]`);
    if (existing) {
      existing.click();
      return;
    }
    const product = currentProducts.find(item => String(item.id) === id);
    if (product && typeof window.fill === 'function') {
      window.fill(product);
      document.getElementById('product-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  document.addEventListener('DOMContentLoaded', ensureBox);
})();
