(() => {
  const TOKEN_KEY = 'reloja_admin_token';
  const SESSION_MARKER = 'cookie-session';

  async function syncSession() {
    try {
      const response = await fetch('/api/admin/session', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const data = await response.json().catch(() => ({}));
      const marker = localStorage.getItem(TOKEN_KEY);

      if (data.authenticated) {
        // Remove qualquer token administrativo antigo que tenha ficado salvo
        // no localStorage e mantém apenas um marcador sem valor de autenticação.
        if (marker !== SESSION_MARKER) {
          localStorage.setItem(TOKEN_KEY, SESSION_MARKER);
          if (!marker) location.reload();
        }
        return;
      }

      if (marker) {
        localStorage.removeItem(TOKEN_KEY);
        location.reload();
      }
    } catch {
      // Se a checagem falhar por indisponibilidade momentânea, não derruba
      // a interface; as próprias APIs protegidas continuarão recusando acesso.
    }
  }

  async function logout() {
    const button = document.getElementById('logout-btn');
    if (button) {
      button.disabled = true;
      button.textContent = 'Saindo...';
    }
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        credentials: 'same-origin',
        cache: 'no-store'
      });
    } catch {
      // Mesmo se a rede falhar, removemos o marcador local. O cookie HttpOnly
      // expira automaticamente e não é acessível ao JavaScript.
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      location.reload();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const logoutButton = document.getElementById('logout-btn');
    if (logoutButton) logoutButton.onclick = logout;
    syncSession();
  });
})();
