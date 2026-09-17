/* RELÓGIO E CIA — carregamento progressivo do catálogo */
(() => {
  'use strict';

  const grid = document.getElementById('product-grid');
  if (!grid) return;

  const BATCH_SIZE = 18;
  let pendingCards = [];
  let totalProducts = 0;
  let mutationObserver = null;
  let visibilityObserver = null;
  let controls = null;

  function observeGrid() {
    mutationObserver?.observe(grid, { childList: true });
  }

  function pauseGridObserver(callback) {
    mutationObserver?.disconnect();
    try { callback(); }
    finally { observeGrid(); }
  }

  function removeControls() {
    visibilityObserver?.disconnect();
    visibilityObserver = null;
    controls?.remove();
    controls = null;
  }

  function visibleCount() {
    return grid.querySelectorAll(':scope > .product-card').length;
  }

  function updateControls() {
    if (!controls) return;
    const shown = visibleCount();
    const summary = controls.querySelector('.catalog-progressive-summary');
    const button = controls.querySelector('.catalog-load-more');
    if (summary) summary.textContent = `${shown} de ${totalProducts} produtos exibidos`;
    if (button) {
      const next = Math.min(BATCH_SIZE, pendingCards.length);
      button.textContent = pendingCards.length ? `Carregar mais ${next}` : 'Todos os produtos foram exibidos';
      button.disabled = pendingCards.length === 0;
    }
    if (!pendingCards.length) visibilityObserver?.disconnect();
  }

  function loadMore() {
    if (!pendingCards.length) return;
    const batch = pendingCards.splice(0, BATCH_SIZE);
    pauseGridObserver(() => {
      const anchor = controls;
      batch.forEach(card => grid.insertBefore(card, anchor));
    });
    updateControls();
  }

  function installControls() {
    if (!pendingCards.length) return;
    controls = document.createElement('div');
    controls.className = 'catalog-progressive-controls';
    controls.innerHTML = `
      <span class="catalog-progressive-summary" role="status" aria-live="polite"></span>
      <button class="btn btn-outline catalog-load-more" type="button"></button>`;
    controls.querySelector('.catalog-load-more').addEventListener('click', loadMore);
    grid.appendChild(controls);
    updateControls();

    if ('IntersectionObserver' in window) {
      visibilityObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) loadMore();
      }, { rootMargin: '500px 0px' });
      visibilityObserver.observe(controls);
    }
  }

  function prepareProgressiveCatalog() {
    const cards = Array.from(grid.querySelectorAll(':scope > .product-card'));
    if (!cards.length) {
      if (grid.querySelector('.catalog-empty-state')) {
        removeControls();
        pendingCards = [];
        totalProducts = 0;
        grid.setAttribute('aria-busy', 'false');
      }
      return;
    }

    removeControls();
    totalProducts = cards.length;
    pendingCards = cards.slice(BATCH_SIZE);

    pauseGridObserver(() => {
      pendingCards.forEach(card => card.remove());
      installControls();
    });
    grid.setAttribute('aria-busy', 'false');
  }

  mutationObserver = new MutationObserver(() => {
    window.requestAnimationFrame(prepareProgressiveCatalog);
  });
  observeGrid();

  if (grid.querySelector(':scope > .product-card')) prepareProgressiveCatalog();
})();
