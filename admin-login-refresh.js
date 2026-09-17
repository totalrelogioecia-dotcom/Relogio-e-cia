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

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('login-btn');
    if (!button) return;

    button.addEventListener('click', () => {
      window.setTimeout(() => {
        const token = localStorage.getItem('reloja_admin_token');
        const dashboard = document.getElementById('dashboard');
        const loginScreen = document.getElementById('login-screen');
        if (token && dashboard && loginScreen && dashboard.style.display !== 'none' && loginScreen.style.display === 'none') {
          window.location.reload();
        }
      }, 300);
    });
  });
})();
