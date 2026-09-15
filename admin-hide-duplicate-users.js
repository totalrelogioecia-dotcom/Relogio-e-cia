(() => {
  'use strict';

  const isUserLabel = value => /^(usuários?|usuarios?|usuários administrativos|usuarios administrativos|usuários do admin|usuarios do admin|usuários do painel|usuarios do painel)$/i.test(String(value || '').replace(/\s+/g, ' ').trim());

  function cleanStandaloneUserCard(root = document) {
    root.querySelectorAll('h1,h2,h3,h4,h5,strong,a,button').forEach(el => {
      if (!isUserLabel(el.textContent)) return;
      if (el.closest('.admin-identity-popover')) return;
      if (el.closest('.admin-tabs')) return;
      if (el.id === 'logout-btn' || el.closest('#login-screen')) return;

      const card = el.closest('.admin-users-card, .admin-user-card, .admin-module-card, .admin-menu-card, .admin-tile, .admin-card, article, section');
      if (card && card.id !== 'dashboard' && card.id !== 'login-screen' && !card.closest('.site-header')) {
        card.remove();
      }
    });
  }

  function start() {
    cleanStandaloneUserCard();
    if (!document.body) return;
    const observer = new MutationObserver(() => cleanStandaloneUserCard());
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
