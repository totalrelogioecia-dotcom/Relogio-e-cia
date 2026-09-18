(() => {
  'use strict';
  const client = window.RelogioAdminClient;
  if (!client) return;
  let leaving = false;
  client.logout = async function () {
    if (leaving) return;
    leaving = true;
    const button = document.getElementById('logout-btn');
    const label = button?.textContent;
    if (button) { button.disabled = true; button.textContent = 'Saindo…'; }
    try {
      const response = await fetch('/api/admin/logout', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      if (!response.ok) throw new Error('Não foi possível encerrar a sessão. Tente novamente.');
      client.applySession(null);
      document.getElementById('admin-email')?.focus();
    } catch (error) {
      await window.RelogioUI.notice(error.message || 'Falha de conexão ao sair. Tente novamente.');
    } finally {
      leaving = false;
      if (button) { button.disabled = false; button.textContent = label; }
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') client.syncSession();
  });
  window.addEventListener('storage', event => {
    if (event.key === 'reloja_admin_token') client.syncSession();
  });
})();
