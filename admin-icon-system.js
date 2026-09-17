(() => {
  'use strict';

  const ICONS = {
    overview: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    pedidos: '<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 8H6"/><circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/>',
    produtos: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12v9"/>',
    reviews: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
    trocas: '<path d="M4 7h12a4 4 0 0 1 4 4v1M8 3 4 7l4 4M20 17H8a4 4 0 0 1-4-4v-1M16 21l4-4-4-4"/>',
    cupons: '<path d="M3 8a2 2 0 0 0 0 4v5h18v-5a2 2 0 0 0 0-4V3H3v5Z"/><path d="M12 6v2M12 12v2"/>',
    confirmacoes: '<path d="M4 5h16v14H4z"/><path d="m4 7 8 6 8-6"/><path d="m9.5 16 1.7 1.7 3.6-4"/>',
    'cancelamentos-loja': '<circle cx="12" cy="12" r="9"/><path d="m8.5 8.5 7 7M15.5 8.5l-7 7"/>',
    audit: '<path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"/>',
    'usuarios-admin': '<path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20"/><circle cx="9.5" cy="7" r="3"/><path d="M17 8v6M14 11h6"/>'
  };

  const LABELS = {
    overview: 'Visão geral', pedidos: 'Pedidos', produtos: 'Produtos', reviews: 'Avaliações', trocas: 'Pós-venda', cupons: 'Cupons', confirmacoes: 'Confirmações', 'cancelamentos-loja': 'Cancelamentos', audit: 'Auditoria', 'usuarios-admin': 'Usuários do Admin'
  };

  function svg(tab, extraClass = '') {
    const paths = ICONS[tab];
    if (!paths) return '';
    return `<span class="admin-system-icon ${extraClass}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></span>`;
  }

  function cleanLeadingSymbols(node) {
    [...node.childNodes].forEach(child => {
      if (child.nodeType !== Node.TEXT_NODE) return;
      child.nodeValue = child.nodeValue.replace(/^\s*[📊🛒📦⭐↩️🎟️🧾📨🚫👥✓✔✕×%≡★]+\s*/u, '');
    });
  }

  function enhanceTab(element) {
    const tab = String(element.dataset.tab || '');
    if (!ICONS[tab]) return;
    element.querySelectorAll(':scope > .admin-nav-icon, :scope > .admin-system-icon').forEach(icon => icon.remove());
    cleanLeadingSymbols(element);
    element.insertAdjacentHTML('afterbegin', svg(tab));
    if (!element.getAttribute('aria-label') && LABELS[tab]) element.setAttribute('aria-label', LABELS[tab]);
    element.dataset.vectorIcon = '1';
  }

  function inferCardTab(card) {
    if (card.dataset?.tab && ICONS[card.dataset.tab]) return card.dataset.tab;
    const text = (card.querySelector('h2,h3,strong')?.textContent || card.textContent || '').trim().toLowerCase();
    if (text.includes('cancelamento')) return 'cancelamentos-loja';
    if (text.includes('confirma')) return 'confirmacoes';
    if (text.includes('pós-venda') || text.includes('troca')) return 'trocas';
    if (text.includes('avalia')) return 'reviews';
    if (text.includes('cupom')) return 'cupons';
    if (text.includes('auditoria')) return 'audit';
    if (text.includes('produto')) return 'produtos';
    if (text.includes('pedido')) return 'pedidos';
    if (text.includes('usuário') || text.includes('usuario')) return 'usuarios-admin';
    return '';
  }

  function enhanceLaunchCards() {
    const candidates = document.querySelectorAll('[data-tab], [data-admin-tab], .admin-area-card, .admin-access-card, .admin-launch-card, .admin-module-card');
    candidates.forEach(card => {
      if (card.closest('.admin-tabs') && card.matches('[data-tab]')) return;
      const tab = inferCardTab(card);
      if (!tab || !ICONS[tab]) return;
      const iconHost = card.querySelector('.admin-area-icon,.admin-access-icon,.admin-launch-icon,.admin-module-icon,[data-admin-icon]');
      if (iconHost) {
        iconHost.innerHTML = svg(tab, 'admin-system-icon-card');
        iconHost.dataset.vectorIcon = '1';
      }
    });
  }

  function enhanceAll() {
    document.querySelectorAll('.admin-tabs [data-tab]').forEach(enhanceTab);
    enhanceLaunchCards();
  }

  function addStyles() {
    if (document.getElementById('admin-icon-system-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-icon-system-style';
    style.textContent = `
      .admin-system-icon{display:inline-flex;width:18px;height:18px;flex:0 0 18px;align-items:center;justify-content:center;color:currentColor;vertical-align:middle}
      .admin-system-icon svg{display:block;width:100%;height:100%}
      .admin-system-icon-card{width:27px;height:27px;flex-basis:27px;color:var(--admin-ink,#111)}
      .admin-tabs [data-tab]{display:inline-flex;align-items:center;gap:8px}
      html.reloja-dark .admin-system-icon-card{color:var(--admin-ink,#f5f5f1)}
      html.reloja-high-contrast .admin-system-icon{color:currentColor!important}
      @media(max-width:700px){.admin-system-icon{width:17px;height:17px;flex-basis:17px}.admin-system-icon-card{width:24px;height:24px;flex-basis:24px}}
    `;
    document.head.appendChild(style);
  }

  addStyles();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhanceAll, { once: true });
  else enhanceAll();

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; enhanceAll(); });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
