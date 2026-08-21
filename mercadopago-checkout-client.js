/* =========================================================
   RELÓGIO E CIA — Checkout Pro limpo
   Usa o SDK oficial MercadoPago.js + preferenceId.
   O fluxo legado de redirect direto fica bloqueado nesta página.
   ========================================================= */
(() => {
  const CART_KEY = 'reloja_carrinho';
  const SESSION_KEY = 'reloja_sessao';
  const TOKEN_KEY = 'reloja_auth_token';
  const SDK_URL = 'https://sdk.mercadopago.com/js/v2';

  let sdkPromise = null;
  let configPromise = null;
  let walletController = null;
  let currentPreferenceId = null;
  let checkoutRunning = false;

  const digits = value => String(value || '').replace(/\D/g, '');

  function formatCpf(value) {
    const n = digits(value).slice(0, 11);
    if (n.length <= 3) return n;
    if (n.length <= 6) return `${n.slice(0, 3)}.${n.slice(3)}`;
    if (n.length <= 9) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`;
    return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
  }

  function cart() {
    try {
      const value = JSON.parse(localStorage.getItem(CART_KEY)) || [];
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
    catch { return null; }
  }

  function paymentMethod() {
    return document.querySelector('input[name="pagamento"]:checked')?.value === 'pix' ? 'pix' : 'cartao';
  }

  function message(text, type = 'info') {
    const element = document.getElementById('cart-msg');
    if (!element) return;
    if (!text) {
      element.style.display = 'none';
      element.textContent = '';
      element.className = '';
      return;
    }
    element.className = type === 'error' ? 'form-error' : '';
    element.textContent = text;
    element.style.display = 'block';
  }

  function button() {
    return document.getElementById('btn-finalizar');
  }

  function ensureWalletHost() {
    let host = document.getElementById('mercadopago-wallet-container');
    if (host) return host;

    host = document.createElement('div');
    host.id = 'mercadopago-wallet-container';
    host.style.cssText = 'display:none;margin-top:14px;min-height:48px;';
    button()?.insertAdjacentElement('afterend', host);
    return host;
  }

  async function clearWallet() {
    currentPreferenceId = null;
    if (walletController?.unmount) {
      try { await walletController.unmount(); } catch (_) {}
    }
    walletController = null;

    const host = ensureWalletHost();
    host.innerHTML = '';
    host.style.display = 'none';

    const finalizeButton = button();
    if (finalizeButton) {
      finalizeButton.style.display = '';
      finalizeButton.disabled = false;
      finalizeButton.textContent = 'Finalizar pedido';
    }
  }

  function showCpfPanel() {
    const existing = document.getElementById('checkout-cpf-panel');
    if (existing) {
      existing.querySelector('input')?.focus();
      return;
    }

    const finalizeButton = button();
    if (!finalizeButton) return;

    const panel = document.createElement('div');
    panel.id = 'checkout-cpf-panel';
    panel.style.cssText = 'border:1px solid #d9d9d9;padding:14px;margin:12px 0;background:#fff;';
    panel.innerHTML = `
      <strong style="display:block;margin-bottom:6px;">CPF para finalizar a compra</strong>
      <span style="display:block;font-size:12px;line-height:1.45;margin-bottom:10px;color:#555;">Precisamos do CPF do comprador para identificação do pedido e análise do pagamento.</span>
      <div style="display:flex;gap:8px;align-items:stretch;">
        <input id="checkout-cpf-input" type="text" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00" maxlength="14" style="min-width:0;flex:1;padding:10px;border:1px solid #bbb;">
        <button id="checkout-cpf-save" type="button" style="border:0;background:#111;color:#fff;padding:10px 12px;font-weight:700;cursor:pointer;">SALVAR</button>
      </div>
      <span id="checkout-cpf-error" style="display:none;color:#d62828;font-size:12px;margin-top:8px;"></span>
    `;
    finalizeButton.insertAdjacentElement('beforebegin', panel);

    const input = panel.querySelector('#checkout-cpf-input');
    const save = panel.querySelector('#checkout-cpf-save');
    const error = panel.querySelector('#checkout-cpf-error');

    input.addEventListener('input', () => { input.value = formatCpf(input.value); });
    input.focus();

    save.addEventListener('click', async () => {
      const cpf = digits(input.value);
      if (cpf.length !== 11) {
        error.textContent = 'Digite os 11 números do CPF.';
        error.style.display = 'block';
        return;
      }

      save.disabled = true;
      save.textContent = 'SALVANDO…';
      error.style.display = 'none';

      try {
        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
        const token = localStorage.getItem(TOKEN_KEY);
        if (token) headers.Authorization = `Bearer ${token}`;

        const response = await fetch('/api/auth/checkout-profile', {
          method: 'POST',
          headers,
          body: JSON.stringify({ cpf })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Não foi possível salvar o CPF.');

        localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
        panel.remove();
        message('CPF salvo. Preparando seu pagamento…');
        beginCheckout();
      } catch (e) {
        error.textContent = e.message || 'Não foi possível salvar o CPF.';
        error.style.display = 'block';
        save.disabled = false;
        save.textContent = 'SALVAR';
      }
    });
  }

  function loadSdk() {
    if (window.MercadoPago) return Promise.resolve(window.MercadoPago);
    if (sdkPromise) return sdkPromise;

    sdkPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${SDK_URL}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(window.MercadoPago), { once: true });
        existing.addEventListener('error', () => reject(new Error('Não foi possível carregar o SDK do Mercado Pago.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = SDK_URL;
      script.async = true;
      script.onload = () => resolve(window.MercadoPago);
      script.onerror = () => reject(new Error('Não foi possível carregar o SDK do Mercado Pago.'));
      document.head.appendChild(script);
    });

    return sdkPromise;
  }

  function loadConfig() {
    if (configPromise) return configPromise;
    configPromise = fetch('/api/mercadopago/config', {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a configuração do Mercado Pago.');
        if (!data.configured || !data.public_key) throw new Error('As credenciais do Mercado Pago ainda não estão configuradas.');
        return data;
      })
      .catch(error => {
        configPromise = null;
        throw error;
      });
    return configPromise;
  }

  async function renderWallet(preferenceId) {
    const [config] = await Promise.all([loadConfig(), loadSdk()]);
    if (!window.MercadoPago) throw new Error('O SDK do Mercado Pago não ficou disponível no navegador.');

    if (currentPreferenceId === preferenceId && walletController) return;
    await clearWallet();

    const host = ensureWalletHost();
    host.style.display = 'block';
    const finalizeButton = button();
    if (finalizeButton) finalizeButton.style.display = 'none';

    const mp = new window.MercadoPago(config.public_key);
    const bricks = mp.bricks();
    walletController = await bricks.create('wallet', host.id, {
      initialization: {
        preferenceId,
        redirectMode: 'self'
      }
    });
    currentPreferenceId = preferenceId;
    message('Pedido preparado. Continue pelo botão seguro do Mercado Pago abaixo.');
  }

  async function beginCheckout() {
    if (checkoutRunning) return;

    const items = cart();
    const user = session();
    const method = paymentMethod();
    const finalizeButton = button();

    if (!items.length) return;
    if (!user?.nome || !user?.email) {
      message('Entre na sua conta antes de finalizar o pedido.', 'error');
      return;
    }

    if (digits(user?.identificacao?.number).length !== 11) {
      message('Informe seu CPF para continuar com a compra.', 'error');
      showCpfPanel();
      return;
    }

    checkoutRunning = true;
    if (finalizeButton) {
      finalizeButton.disabled = true;
      finalizeButton.textContent = 'Preparando pagamento…';
    }
    message('Preparando seu pedido com segurança…');

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          items: items.map(item => ({ id: item.id, qtd: item.qtd })),
          payer: { nome: user.nome, email: user.email },
          metodo: method
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.error || 'Não foi possível iniciar o pagamento.');
        error.code = data.code || null;
        throw error;
      }

      if (method === 'pix') {
        const redirect = data.redirect_url || data.init_point;
        if (!redirect) throw new Error('O Mercado Pago não retornou a página do PIX.');
        window.location.assign(redirect);
        return;
      }

      // O backend devolve o init_point oficial da preferência. Assim o cliente
      // clica em FINALIZAR PEDIDO uma única vez e segue direto ao Checkout Pro.
      if (data.init_point) {
        window.location.assign(data.init_point);
        return;
      }

      // Fallback de segurança para preferências antigas sem init_point.
      if (!data.preference_id) {
        throw new Error('O Mercado Pago não retornou o identificador da preferência.');
      }
      await renderWallet(data.preference_id);
    } catch (error) {
      checkoutRunning = false;
      if (error.code === 'cpf_required') {
        message('Informe seu CPF para continuar com a compra.', 'error');
        showCpfPanel();
      } else {
        message(error.message || 'Não foi possível iniciar o pagamento.', 'error');
      }
      if (finalizeButton) {
        finalizeButton.style.display = '';
        finalizeButton.disabled = false;
        finalizeButton.textContent = 'Finalizar pedido';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const finalizeButton = button();
    if (!finalizeButton) return;

    ensureWalletHost();

    // Captura o clique antes do listener legado de script.js. Assim somente
    // esta implementação controla /api/checkout nesta versão da integração.
    finalizeButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      beginCheckout();
    }, true);

    document.getElementById('payment-form')?.addEventListener('change', () => {
      if (walletController || currentPreferenceId) {
        clearWallet().catch(() => {});
        message('Forma de pagamento alterada. Finalize o pedido novamente.');
      }
    });
  });
})();
