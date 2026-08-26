/* =========================================================
   RELÓGIO E CIA — filtros técnicos do catálogo
   Complementa marca/categoria/preço sem alterar script.js.
   ========================================================= */
(function () {
  const DETAILS_URL = '/api/product-details';
  let detailsMap = {};
  let observer = null;

  function plain(value) {
    return String(value || '').trim();
  }

  function fold(value) {
    return plain(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function movementLabel(product, details) {
    const text = fold([
      details?.movimento,
      product?.nome,
      product?.desc
    ].filter(Boolean).join(' '));

    if (/automatic|mecan|self[ -]?winding/.test(text)) return 'Automático';
    if (/quartz|quartzo|digital|solar|eco[ -]?drive|bateria|pilha/.test(text)) return 'Quartz';
    return '';
  }

  function materialLabel(value) {
    const raw = plain(value);
    const text = fold(raw);
    if (!text) return '';

    if (/carbon/.test(text) && /resin/.test(text)) return 'Carbono / Resina';
    if (/aco|steel|inox/.test(text)) return 'Aço inoxidável';
    if (/titan/.test(text)) return 'Titânio';
    if (/resin/.test(text)) return 'Resina';
    if (/couro|leather/.test(text)) return 'Couro';
    if (/silicone|silicon/.test(text)) return 'Silicone';
    if (/nylon|tecido|fabric/.test(text)) return 'Nylon / Tecido';
    if (/borracha|rubber/.test(text)) return 'Borracha';
    if (/metal/.test(text)) return 'Metal';

    return raw.length <= 34 ? raw : `${raw.slice(0, 31)}…`;
  }

  function productTechnical(product) {
    const details = detailsMap[String(product?.id)] || product?.detalhes || {};
    return {
      movimento: movementLabel(product, details),
      caixa: materialLabel(details?.caixa_material),
      pulseira: materialLabel(details?.pulseira_material)
    };
  }

  function checkedValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(input => input.value);
  }

  function activeTechnicalFilters() {
    return {
      movimentos: checkedValues('movimento'),
      caixas: checkedValues('caixa-material'),
      pulseiras: checkedValues('pulseira-material')
    };
  }

  function matchesTechnical(product, filters) {
    const info = productTechnical(product);
    const okMovement = !filters.movimentos.length || filters.movimentos.includes(info.movimento);
    const okCase = !filters.caixas.length || filters.caixas.includes(info.caixa);
    const okStrap = !filters.pulseiras.length || filters.pulseiras.includes(info.pulseira);
    return okMovement && okCase && okStrap;
  }

  function cardProductId(card) {
    const detailButton = card.querySelector('[data-produto]');
    const addButton = card.querySelector('[data-add-carrinho]');
    return Number(detailButton?.dataset.produto || addButton?.dataset.addCarrinho || 0);
  }

  function ensureEmptyMessage(grid) {
    let empty = document.getElementById('catalog-technical-empty');
    if (empty) return empty;

    empty = document.createElement('div');
    empty.id = 'catalog-technical-empty';
    empty.className = 'catalog-technical-empty';
    empty.hidden = true;
    empty.innerHTML = '<strong>Nenhum produto encontrado</strong><span>Tente remover um dos filtros técnicos.</span>';
    grid.insertAdjacentElement('afterend', empty);
    return empty;
  }

  function applyTechnicalFilters() {
    const grid = document.getElementById('product-grid');
    if (!grid || typeof PRODUTOS === 'undefined') return;

    const cards = Array.from(grid.querySelectorAll('.product-card'));
    const filters = activeTechnicalFilters();
    const hasTechnicalFilter = filters.movimentos.length || filters.caixas.length || filters.pulseiras.length;
    let visible = 0;

    cards.forEach(card => {
      const id = cardProductId(card);
      const product = PRODUTOS.find(item => Number(item.id) === id);
      const show = !product || matchesTechnical(product, filters);
      card.hidden = !show;
      if (show) visible += 1;
    });

    const count = document.getElementById('result-count');
    if (count && cards.length) {
      count.innerHTML = `<strong>${visible}</strong> produto${visible === 1 ? '' : 's'} encontrado${visible === 1 ? '' : 's'}`;
    }

    const empty = ensureEmptyMessage(grid);
    empty.hidden = !hasTechnicalFilter || visible > 0 || cards.length === 0;
  }

  function optionMarkup(name, value, count) {
    const safe = String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<label class="check-row"><input type="checkbox" name="${name}" value="${safe}"> ${safe} <span class="count">${count}</span></label>`;
  }

  function technicalCounts(kind) {
    const map = new Map();
    if (typeof PRODUTOS === 'undefined') return map;

    PRODUTOS
      .filter(product => product?.ativo !== false && String(product?.categoria || '') === 'Relógios')
      .forEach(product => {
        const value = productTechnical(product)[kind];
        if (!value) return;
        map.set(value, (map.get(value) || 0) + 1);
      });
    return map;
  }

  function renderMovementOptions() {
    const host = document.getElementById('filter-movement-options');
    if (!host) return;
    const counts = technicalCounts('movimento');
    host.innerHTML = [
      optionMarkup('movimento', 'Quartz', counts.get('Quartz') || 0),
      optionMarkup('movimento', 'Automático', counts.get('Automático') || 0)
    ].join('');
  }

  function renderMaterialOptions(hostId, inputName, kind) {
    const host = document.getElementById(hostId);
    if (!host) return;
    const counts = technicalCounts(kind);
    const values = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    if (!values.length) {
      host.innerHTML = '<span class="filter-options-empty">Sem materiais cadastrados na ficha técnica.</span>';
      return;
    }

    host.innerHTML = values.map(value => optionMarkup(inputName, value, counts.get(value))).join('');
  }

  function bindTechnicalInputs() {
    document.querySelectorAll('input[name="movimento"], input[name="caixa-material"], input[name="pulseira-material"]')
      .forEach(input => {
        if (input.dataset.technicalBound) return;
        input.dataset.technicalBound = '1';
        input.addEventListener('change', applyTechnicalFilters);
      });
  }

  function patchResetButton() {
    const reset = document.getElementById('reset-filtros');
    if (!reset || reset.dataset.technicalResetBound) return;
    reset.dataset.technicalResetBound = '1';
    reset.addEventListener('click', () => {
      document.querySelectorAll('input[name="movimento"], input[name="caixa-material"], input[name="pulseira-material"]')
        .forEach(input => { input.checked = false; });
      window.setTimeout(applyTechnicalFilters, 0);
    });
  }

  function watchGrid() {
    const grid = document.getElementById('product-grid');
    if (!grid || observer) return;
    observer = new MutationObserver(() => window.setTimeout(applyTechnicalFilters, 0));
    observer.observe(grid, { childList: true });
  }

  async function loadDetails() {
    try {
      const response = await fetch(DETAILS_URL, { cache: 'no-store' });
      if (!response.ok) return {};
      const value = await response.json();
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  async function init() {
    if (!document.getElementById('product-grid')) return;

    watchGrid();
    patchResetButton();
    detailsMap = await loadDetails();

    const waitForProducts = async () => {
      if (typeof quandoCatalogoPronto === 'function') {
        await quandoCatalogoPronto(() => {});
      }
    };
    await waitForProducts();

    renderMovementOptions();
    renderMaterialOptions('filter-case-options', 'caixa-material', 'caixa');
    renderMaterialOptions('filter-strap-options', 'pulseira-material', 'pulseira');
    bindTechnicalInputs();
    applyTechnicalFilters();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
