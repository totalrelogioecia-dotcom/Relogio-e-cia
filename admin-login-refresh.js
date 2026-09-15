(() => {
  'use strict';

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
