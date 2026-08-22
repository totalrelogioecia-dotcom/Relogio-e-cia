(function () {
  'use strict';

  const TOKEN_KEY = 'reloja_admin_token';
  const $ = selector => document.querySelector(selector);
  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  let timer = null;
  let lastController = null;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function escAttr(value) {
    return esc(value).replace(/`/g, '&#96;');
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
      .stock-catalog-badge.in{border-color:#83bd98;color:#087d3e}.stock-catalog-badge.base{border-color:#c9b77a;color:#786516}.stock-catalog-badge.hidden{border-color:#bbb;color:#666}
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
          <h3>Pesquisa de estoque e catálogo</h3>
          <p>Pesquise por referência, nome ou marca. O catálogo base fica separado dos produtos da loja e carrega só resultados compactos, deixando o painel leve mesmo com muitos modelos.</p>
        </div>
        <div id="stock-catalog-counts" class="stock-catalog-counts"></div>
      </div>
      <div class="stock-catalog-search">
        <input id="stock-catalog-query" type="search" autocomplete="off" placeholder="Ex.: GA-2100, W-218H, G-Shock...">
        <select id="stock-catalog-filter" aria-label="Filtrar catálogo">
          <option value="todos">Todos</option>
          <option value="base">Catálogo base</option>
          <option value="em_estoque">Em estoque</option>
          <option value="sem_estoque">Sem estoque</option>
          <option value="oculto">Ocultos</option>
        </select>
      </div>
      <div id="stock-catalog-status" class="stock-catalog-status">Digite pelo menos 2 caracteres para pesquisar.</div>
      <div id="stock-catalog-results" class="stock-catalog-results"><div class="stock-catalog-placeholder">O catálogo base não é carregado inteiro no navegador. Só os resultados da sua busca aparecem aqui.</div></div>`;
    toolbar.insertAdjacentElement('afterend', box);

    $('#stock-catalog-query').addEventListener('input', scheduleSearch);
    $('#stock-catalog-filter').addEventListener('change', () => runSearch(true));
    document.addEventListener('click', handleAction);
  }

  function authHeaders() {
    const headers = { Accept: 'application/json' };
    if (token()) headers.Authorization = `Bearer ${token()}`;
    return headers;
  }

  function statusLabel(item) {
    if (item.status === 'em_estoque') return ['Em estoque', 'in'];
    if (item.status === 'sem_estoque') return ['Sem estoque', 'hidden'];
    if (item.status === 'oculto') return ['Oculto', 'hidden'];
    return ['Catálogo base', 'base'];
  }

  function scheduleSearch() {
    clearTimeout(timer);
    timer = setTimeout(() => runSearch(false), 260);
  }

  async function runSearch(force) {
    const input = $('#stock-catalog-query');
    const query = String(input?.value || '').trim();
    const filter = $('#stock-catalog-filter')?.value || 'todos';
    const status = $('#stock-catalog-status');
    const results = $('#stock-catalog-results');

    if (!force && query.length < 2) {
      status.textContent = 'Digite pelo menos 2 caracteres para pesquisar.';
      results.innerHTML = '<div class="stock-catalog-placeholder">O catálogo base não é carregado inteiro no navegador. Só os resultados da sua busca aparecem aqui.</div>';
      return;
    }
    if (force && query.length < 2) {
      status.textContent = 'Digite pelo menos 2 caracteres para usar esse filtro.';
      return;
    }

    if (lastController) lastController.abort();
    lastController = new AbortController();
    status.textContent = 'Pesquisando...';

    try {
      const params = new URLSearchParams({ q: query, status: filter, limit: '30' });
      const response = await fetch(`/api/admin/catalog-base?${params}`, {
        cache: 'no-store', credentials: 'same-origin', signal: lastController.signal, headers: authHeaders()
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error('Sua sessão administrativa expirou. Entre novamente no painel.');
      if (!response.ok) throw new Error(data.error || 'Não foi possível pesquisar o catálogo.');
      render(data);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      status.textContent = error.message || 'Não foi possível pesquisar o catálogo.';
      results.innerHTML = '<div class="stock-catalog-placeholder">Tente novamente.</div>';
    }
  }

  function render(data) {
    const items = Array.isArray(data.items) ? data.items : [];
    const status = $('#stock-catalog-status');
    const results = $('#stock-catalog-results');
    const counts = $('#stock-catalog-counts');
    const c = data.counts || {};
    counts.textContent = `${Number(c.catalogo || 0)} no catálogo base · ${Number(c.loja || 0)} produtos da loja`;
    status.textContent = `${Number(data.total || 0)} resultado(s). Mostrando até ${Number(data.limit || 30)} por pesquisa.`;

    if (!items.length) {
      results.innerHTML = '<div class="stock-catalog-placeholder">Nenhum modelo encontrado com esse filtro.</div>';
      return;
    }

    results.innerHTML = `<table class="admin-table"><thead><tr><th>Modelo</th><th>Referência</th><th>Status</th><th>Estoque</th><th>Ações</th></tr></thead><tbody>${items.map(item => {
      const [label, css] = statusLabel(item);
      const action = item.product_id
        ? `<button type="button" data-catalog-edit="${escAttr(item.product_id)}">Editar produto</button>`
        : `<button type="button" data-catalog-add="${escAttr(item.sku)}">Adicionar ao estoque</button>`;
      const photo = item.foto ? `<img class="stock-catalog-thumb" src="${escAttr(item.foto)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '';
      return `<tr><td><div class="stock-catalog-product">${photo}<div><strong>${esc(item.nome || item.sku)}</strong><br><small>${esc(item.marca || '')}</small></div></div></td><td>${esc(item.sku)}</td><td><span class="stock-catalog-badge ${css}">${label}</span></td><td>${Number(item.estoque || 0)}</td><td><div class="admin-actions">${action}</div></td></tr>`;
    }).join('')}</tbody></table>`;
  }

  async function handleAction(event) {
    const add = event.target.closest('[data-catalog-add]');
    if (add) {
      event.preventDefault();
      await prepareBase(add.dataset.catalogAdd, add);
      return;
    }

    const edit = event.target.closest('[data-catalog-edit]');
    if (edit) {
      event.preventDefault();
      const existing = document.querySelector(`#products-list [data-edit="${CSS.escape(String(edit.dataset.catalogEdit))}"]`);
      if (existing) {
        existing.click();
        return;
      }
      try {
        const response = await fetch('/api/admin/products', { cache: 'no-store', credentials: 'same-origin', headers: authHeaders() });
        const products = await response.json().catch(() => []);
        const product = Array.isArray(products) ? products.find(p => String(p.id) === String(edit.dataset.catalogEdit)) : null;
        if (product && typeof window.fill === 'function') window.fill(product);
      } catch {}
    }
  }

  function clearShipping() {
    ['shipping-weight', 'shipping-width', 'shipping-height', 'shipping-length'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  function setDetails(details) {
    const keys = ['movimento','caixa_material','pulseira_material','cor','diametro','resistencia_agua','vidro','garantia','conteudo_embalagem'];
    keys.forEach(key => {
      const el = document.getElementById(`pd-${key}`);
      if (el) el.value = String(details?.[key] || '');
    });
  }

  async function prepareBase(sku, button) {
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Abrindo...';
    try {
      const response = await fetch(`/api/admin/catalog-base/${encodeURIComponent(sku)}`, {
        cache: 'no-store', credentials: 'same-origin', headers: authHeaders()
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível abrir esse modelo.');
      const item = data.item;
      if (!item) throw new Error('Modelo não encontrado no catálogo base.');

      if (typeof window.resetPhotos === 'function') window.resetPhotos();
      if (typeof window.fill === 'function') window.fill();

      $('#p-id').value = '';
      $('#p-nome').value = item.nome || item.sku || '';
      $('#p-marca').value = item.marca || '';
      $('#p-categoria').value = item.categoria || 'Relógios';
      $('#p-sku').value = item.sku || '';
      $('#p-preco').value = '';
      $('#p-estoque').value = '0';
      $('#p-desc').value = item.desc || '';
      $('#p-ativo').checked = false;
      $('#editor-title').textContent = 'Adicionar modelo ao estoque';
      if ($('#p-fotos')) $('#p-fotos').value = '';
      if (typeof window.setPhotos === 'function') window.setPhotos(Array.isArray(item.fotos) ? item.fotos : []);
      setDetails(item.detalhes || {});
      clearShipping();

      const editor = $('#product-editor');
      if (editor) editor.style.display = 'block';
      const adminMsg = $('#admin-msg');
      if (adminMsg) {
        adminMsg.className = 'form-success';
        adminMsg.textContent = 'Modelo carregado do catálogo base. Informe preço, quantidade e dados de frete; ative a visibilidade somente quando estiver pronto para vender.';
        adminMsg.style.display = 'block';
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      const status = $('#stock-catalog-status');
      if (status) status.textContent = error.message || 'Não foi possível abrir esse modelo.';
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  document.addEventListener('DOMContentLoaded', ensureBox);
})();

