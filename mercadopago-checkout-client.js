/* =========================================================
   RELÓGIO E CIA — Checkout Pro limpo
   Usa o SDK oficial MercadoPago.js + preferenceId.
   O fluxo legado de redirect direto fica bloqueado nesta página.
   ========================================================= */
(() => {
  const CART_KEY = 'reloja_carrinho';
  const SESSION_KEY = 'reloja_sessao';
  const SDK_URL = 'https://sdk.mercadopago.com/js/v2';

  let sdkPromise = null;
  let configPromise = null;
  let walletController = null;
  let currentPreferenceId = null;

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
    const items = cart();
    const user = session();
    const method = paymentMethod();
    const finalizeButton = button();

    if (!items.length) return;
    if (!user?.nome || !user?.email) {
      message('Entre na sua conta antes de finalizar o pedido.', 'error');
      return;
    }

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
      if (!response.ok) throw new Error(data.error || 'Não foi possível iniciar o pagamento.');

      if (method === 'pix') {
        const redirect = data.redirect_url || data.init_point;
        if (!redirect) throw new Error('O Mercado Pago não retornou a página do PIX.');
        window.location.href = redirect;
        return;
      }

      if (!data.preference_id) {
        throw new Error('O Mercado Pago não retornou o identificador da preferência.');
      }

      await renderWallet(data.preference_id);
    } catch (error) {
      message(error.message || 'Não foi possível iniciar o pagamento.', 'error');
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
