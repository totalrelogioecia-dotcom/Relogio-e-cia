(() => {
  'use strict';

  function loadAdminIconSystem() {
    if (document.querySelector('script[data-admin-icon-system]')) return;
    const script = document.createElement('script');
    script.src = 'admin-icon-system.js?v=1';
    script.dataset.adminIconSystem = '1';
    script.async = false;
    document.head.appendChild(script);
  }

  loadAdminIconSystem();

  // Compatibilidade do endereço antigo, sem recarregar após o login.
})();
