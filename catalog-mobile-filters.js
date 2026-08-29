/* =========================================================
   RELÓGIO E CIA — filtros mobile em painel lateral
   Mantém os filtros do catálogo fora do caminho dos produtos.
   ========================================================= */
(() => {
  'use strict';

  const MOBILE_QUERY = '(max-width: 860px)';
  const media = window.matchMedia(MOBILE_QUERY);

  function activeFilterCount(filters) {
    if (!filters) return 0;
    let count = filters.querySelectorAll('input[type="checkbox"]:checked, input[type="radio"]:checked').length;
    filters.querySelectorAll('input[type="number"], input[type="text"]').forEach(input => {
      if (String(input.value || '').trim()) count += 1;
    });
    return count;
  }

  function init() {
    const layout = document.querySelector('.products-layout');
    const filters = layout?.querySelector('.filters');
    if (!layout || !filters || document.querySelector('.catalog-mobile-filter-trigger')) return;

    const controls = document.createElement('div');
    controls.className = 'catalog-mobile-controls';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'catalog-mobile-filter-trigger';
    trigger.setAttribute('aria-controls', 'catalog-filters-panel');
    trigger.setAttribute('aria-expanded', 'false');
    controls.appendChild(trigger);
    layout.parentNode.insertBefore(controls, layout);

    filters.id = filters.id || 'catalog-filters-panel';
    filters.setAttribute('aria-label', 'Filtros do catálogo');

    const panelHead = document.createElement('div');
    panelHead.className = 'catalog-filter-panel-head';
    panelHead.innerHTML = '<strong>Filtros</strong><button type="button" class="catalog-filter-close" aria-label="Fechar filtros">×</button>';
    filters.prepend(panelHead);

    const backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'catalog-filter-backdrop';
    backdrop.setAttribute('aria-label', 'Fechar filtros');
    document.body.appendChild(backdrop);

    const closeButton = panelHead.querySelector('.catalog-filter-close');
    let lastFocused = null;

    function updateTrigger() {
      const count = activeFilterCount(filters);
      trigger.textContent = count ? `Filtros (${count})` : 'Filtros';
      trigger.setAttribute('aria-label', count ? `Abrir filtros, ${count} selecionado${count === 1 ? '' : 's'}` : 'Abrir filtros');
    }

    function open() {
      if (!media.matches) return;
      lastFocused = document.activeElement;
      document.body.classList.add('catalog-filters-open');
      trigger.setAttribute('aria-expanded', 'true');
      window.requestAnimationFrame(() => closeButton?.focus());
    }

    function close() {
      document.body.classList.remove('catalog-filters-open');
      trigger.setAttribute('aria-expanded', 'false');
      if (lastFocused?.focus) lastFocused.focus();
      lastFocused = null;
    }

    trigger.addEventListener('click', open);
    closeButton?.addEventListener('click', close);
    backdrop.addEventListener('click', close);

    filters.addEventListener('change', updateTrigger);
    filters.addEventListener('input', updateTrigger);
    filters.querySelector('#apply-filters')?.addEventListener('click', () => {
      updateTrigger();
      if (media.matches) close();
    });
    filters.querySelector('#reset-filtros')?.addEventListener('click', () => {
      window.setTimeout(updateTrigger, 0);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.body.classList.contains('catalog-filters-open')) close();
    });

    const onMediaChange = () => {
      if (!media.matches) close();
      updateTrigger();
    };
    if (typeof media.addEventListener === 'function') media.addEventListener('change', onMediaChange);
    else if (typeof media.addListener === 'function') media.addListener(onMediaChange);

    updateTrigger();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
