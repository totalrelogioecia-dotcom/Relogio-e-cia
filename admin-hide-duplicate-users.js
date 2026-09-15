(() => {
  'use strict';

  const USER_LABEL = /^(usuários?\s+do\s+admin|usuarios?\s+do\s+admin|usuários?\s+administrativos|usuarios?\s+administrativos|usuários?\s+do\s+painel|usuarios?\s+do\s+painel)$/i;
  const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim();

  function isProtected(element) {
    return !!(
      element.closest?.('.site-header') ||
      element.closest?.('.admin-identity-popover') ||
      element.closest?.('.admin-identity-wrap') ||
      element.closest?.('.admin-tabs') ||
      element.closest?.('#login-screen')
    );
  }

  function findCard(element) {
    return element.closest?.(
      '.admin-users-card, .admin-user-card, .admin-module-card, .admin-menu-card, .admin-tile, .admin-card, .dashboard-card, article, section, div'
    ) || element.parentElement;
  }

  function removeDuplicateUserCards(root = document) {
    const candidates = root.querySelectorAll?.('h1,h2,h3,h4,h5,h6,strong,b,a,button,p,span,div') || [];

    candidates.forEach(element => {
      const text = cleanText(element.textContent);
      if (!USER_LABEL.test(text)) return;
      if (isProtected(element)) return;

      // Só considera o elemento como título do card quando o texto dele é exatamente o rótulo.
      // Assim não removemos outras áreas que apenas mencionem usuários.
      if (cleanText(element.textContent) !== text) return;

      const card = findCard(element);
      if (!card || card.id === 'dashboard' || card.id === 'login-screen') return;
      if (isProtected(card)) return;
      if (cleanText(card.textContent).length > 500) {
        // Tenta um ancestral menor para não remover um bloco grande do painel.
        const smaller = element.closest?.('.admin-users-card, .admin-user-card, .admin-module-card, .admin-menu-card, .admin-tile, .dashboard-card, article');
        if (smaller && !isProtected(smaller)) smaller.remove();
        return;
      }
      card.remove();
    });
  }

  function start() {
    removeDuplicateUserCards();

    const observer = new MutationObserver(() => {
      removeDuplicateUserCards();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Reforça a limpeza durante a navegação/renderização dinâmica do painel.
    const interval = window.setInterval(removeDuplicateUserCards, 1000);
    window.addEventListener('beforeunload', () => {
      observer.disconnect();
      window.clearInterval(interval);
    }, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
