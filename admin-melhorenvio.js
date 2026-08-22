(function () {
  const TOKEN_KEY = 'reloja_admin_token';
  let mounted = false;

  function token() { return localStorage.getItem(TOKEN_KEY) || ''; }

  async function api(url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' },
      cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o Melhor Envio.');
    return data;
  }

  function ensureCard() {
    if (mounted || !document.getElementById('dashboard')) return;
    const tabs = document.querySelector('.admin-tabs');
    if (!tabs) return;
    const card = document.createElement('section');
    card.id = 'melhorenvio-admin-card';
    card.className = 'admin-card melhorenvio-admin-card';
    card.innerHTML = `
      <div class="melhorenvio-admin-head">
        <div>
          <p class="eyebrow">Frete automático</p>
          <h3>Melhor Envio</h3>
          <p id="melhorenvio-admin-text" class="admin-muted">Verificando a integração...</p>
        </div>
        <span id="melhorenvio-admin-badge" class="melhorenvio-badge pending">Verificando</span>
      </div>
      <div id="melhorenvio-admin-details" class="melhorenvio-admin-details"></div>
      <div class="editor-actions">
        <button id="melhorenvio-connect" type="button" class="btn btn-primary" disabled>Conectar Melhor Envio</button>
        <button id="melhorenvio-refresh" type="button" class="btn btn-outline">Atualizar status</button>
      </div>`;
    tabs.insertAdjacentElement('afterend', card);
    document.getElementById('melhorenvio-refresh').onclick = refresh;
    document.getElementById('melhorenvio-connect').onclick = connect;
    mounted = true;
  }

  function render(status) {
    const badge = document.getElementById('melhorenvio-admin-badge');
    const text = document.getElementById('melhorenvio-admin-text');
    const details = document.getElementById('melhorenvio-admin-details');
    const button = document.getElementById('melhorenvio-connect');
    if (!badge || !text || !details || !button) return;

    const environment = status.environment === 'production' ? 'Produção' : 'Sandbox';
    details.innerHTML = `<span>Ambiente: <strong>${environment}</strong></span><span>CEP de origem: <strong>${status.origin_postal_code_configured ? 'configurado' : 'pendente'}</strong></span><span>OAuth: <strong>${status.oauth_configured ? 'configurado' : 'pendente'}</strong></span>`;

    if (status.connected && status.configured) {
      badge.className = 'melhorenvio-badge ok';
      badge.textContent = 'Conectado';
      text.textContent = 'A conta está autorizada e pronta para calcular fretes no carrinho.';
      button.disabled = false;
      button.textContent = 'Reautorizar conta';
      return;
    }

    if (status.oauth_configured) {
      badge.className = 'melhorenvio-badge pending';
      badge.textContent = status.connected ? 'Configuração incompleta' : 'Aguardando autorização';
      if (status.connected && !status.origin_postal_code_configured) {
        text.textContent = 'A conta já está autorizada. Falta apenas o CEP de origem no servidor.';
      } else {
        text.textContent = status.origin_postal_code_configured
          ? 'As credenciais estão no servidor. Falta apenas autorizar a conta do Melhor Envio.'
          : 'As credenciais estão no servidor. Configure também o CEP de origem antes dos testes de frete.';
      }
      button.disabled = false;
      button.textContent = status.connected ? 'Reautorizar conta' : 'Conectar Melhor Envio';
      return;
    }

    badge.className = 'melhorenvio-badge pending';
    badge.textContent = 'Configuração pendente';
    text.textContent = 'Adicione Client ID, Client Secret e URL de redirecionamento nas variáveis do Render.';
    button.disabled = true;
    button.textContent = 'Conectar Melhor Envio';
  }

  async function refresh() {
    if (!token()) return;
    ensureCard();
    try {
      // Esta rota reúne o estado real da autenticação e também do CEP de origem.
      // O endpoint administrativo de OAuth sozinho não informa o CEP.
      const status = await api('/api/shipping/config');
      render(status);
    } catch (error) {
      const text = document.getElementById('melhorenvio-admin-text');
      if (text) text.textContent = error.message;
    }
  }

  async function connect() {
    const button = document.getElementById('melhorenvio-connect');
    if (button) { button.disabled = true; button.textContent = 'Abrindo autorização...'; }
    try {
      const data = await api('/api/admin/melhorenvio/authorize-url');
      if (!data.url) throw new Error('O servidor não retornou a URL de autorização.');
      location.href = data.url;
    } catch (error) {
      alert(error.message);
      if (button) { button.disabled = false; button.textContent = 'Conectar Melhor Envio'; }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureCard();
    const timer = setInterval(() => {
      if (!token()) return;
      clearInterval(timer);
      refresh();
    }, 700);
    setTimeout(() => clearInterval(timer), 30000);
  });
})();
