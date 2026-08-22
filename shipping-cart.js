/* =========================================================
   RELÓGIO E CIA — frete automático no carrinho
   Cotação via backend + Melhor Envio. O token nunca vai ao navegador.
   ========================================================= */
(function () {
  const CART_KEY = 'reloja_carrinho';
  const SESSION_KEY = 'reloja_sessao';
  const SHIPPING_KEY = 'reloja_frete_selecionado';
  let config = { configured: false };
  let selected = null;
  let lastQuotedCartSignature = '';

  const digits = value => String(value || '').replace(/\D/g, '');
  const brl = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function cart() {
    try {
      const value = JSON.parse(localStorage.getItem(CART_KEY)) || [];
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
    catch { return null; }
  }

  function cartSignature() {
    return cart().map(i => `${Number(i.id)}:${Number(i.qtd || 1)}`).sort().join('|');
  }

  function subtotal() {
    return cart().reduce((sum, item) => sum + Number(item.preco || 0) * Number(item.qtd || 1), 0);
  }

  function pixSelected() {
    return document.querySelector('input[name="pagamento"]:checked')?.value === 'pix';
  }

  function formatCep(value) {
    const n = digits(value).slice(0, 8);
    return n.length > 5 ? `${n.slice(0, 5)}-${n.slice(5)}` : n;
  }

  function saveSelected(value) {
    selected = value || null;
    if (selected) sessionStorage.setItem(SHIPPING_KEY, JSON.stringify(selected));
    else sessionStorage.removeItem(SHIPPING_KEY);
  }

  function loadSelected() {
    try {
      const value = JSON.parse(sessionStorage.getItem(SHIPPING_KEY));
      if (value?.service_id && value?.price != null) selected = value;
    } catch {}
  }

  function ensureUi() {
    const form = document.getElementById('payment-form');
    const summary = document.getElementById('cart-summary-box');
    if (!form || !summary || document.getElementById('shipping-box')) return;

    const box = document.createElement('div');
    box.id = 'shipping-box';
    box.className = 'shipping-box';
    box.innerHTML = `
      <div class="shipping-box__head">
        <div><strong>Calcular entrega</strong><div class="shipping-help">Escolha o frete antes de finalizar o pedido.</div></div>
        <span class="shipping-config-badge off" id="shipping-config-badge">Melhor Envio</span>
      </div>
      <div class="shipping-form">
        <input id="shipping-postal-code" inputmode="numeric" maxlength="9" placeholder="CEP de entrega" aria-label="CEP de entrega">
        <button id="shipping-quote-btn" type="button">Calcular</button>
      </div>
      <div id="shipping-lock-note" class="shipping-lock" style="display:none"></div>
      <div id="shipping-message" class="shipping-message"></div>
      <div id="shipping-options" class="shipping-options"></div>`;
    summary.insertBefore(box, form);

    const totalRow = document.querySelector('.cart-summary-row.total');
    if (totalRow) {
      const shippingRow = document.createElement('div');
      shippingRow.id = 'cart-shipping-row';
      shippingRow.className = 'cart-summary-row shipping-row';
      shippingRow.innerHTML = '<span>Frete</span><span id="cart-shipping">R$ 0,00</span>';
      totalRow.parentNode.insertBefore(shippingRow, totalRow);
    }

    const input = document.getElementById('shipping-postal-code');
    input.addEventListener('input', () => {
      input.value = formatCep(input.value);
      if (selected && digits(input.value) !== digits(selected.postal_code)) {
        clearSelection('O CEP mudou. Calcule o frete novamente.');
      }
    });
    document.getElementById('shipping-quote-btn').addEventListener('click', quote);
    document.getElementById('payment-form')?.addEventListener('change', updateTotal);
  }

  function prefillPostalCode() {
    const input = document.getElementById('shipping-postal-code');
    if (!input) return;
    const user = session();
    const zip = digits(user?.endereco?.zip_code).slice(0, 8);
    if (zip.length === 8) {
      input.value = formatCep(zip);
      input.readOnly = true;
      const note = document.getElementById('shipping-lock-note');
      note.textContent = 'CEP do endereço de entrega cadastrado na sua conta.';
      note.style.display = 'block';
    } else if (selected?.postal_code) {
      input.value = formatCep(selected.postal_code);
    }
  }

  function message(text, kind = 'info') {
    const el = document.getElementById('shipping-message');
    if (!el) return;
    if (!text) {
      el.style.display = 'none';
      el.textContent = '';
      el.className = 'shipping-message';
      return;
    }
    el.textContent = text;
    el.className = `shipping-message ${kind}`;
  }

  function clearSelection(reason) {
    saveSelected(null);
    document.querySelectorAll('.shipping-option').forEach(x => x.classList.remove('is-selected'));
    document.querySelectorAll('input[name="shipping_service"]').forEach(x => { x.checked = false; });
    if (reason) message(reason, 'info');
    updateTotal();
  }

  function updateTotal() {
    const subtotalValue = subtotal();
    const discount = pixSelected() ? subtotalValue * 0.05 : 0;
    const freight = Number(selected?.price || 0);
    const total = subtotalValue - discount + freight;
    const totalEl = document.getElementById('cart-total');
    if (totalEl) totalEl.textContent = brl(total);
    const row = document.getElementById('cart-shipping-row');
    const value = document.getElementById('cart-shipping');
    if (row && value) {
      value.textContent = brl(freight);
      row.classList.toggle('is-visible', Boolean(selected));
    }
  }

  function renderQuotes(quotes, postalCode) {
    const host = document.getElementById('shipping-options');
    host.innerHTML = (quotes || []).map(q => {
      const checked = selected && String(selected.service_id) === String(q.service_id);
      const company = q.company_name ? `${q.company_name} · ` : '';
      const days = q.delivery_time == null ? 'prazo informado pela transportadora' : `${q.delivery_time} dia${q.delivery_time === 1 ? '' : 's'} útil${q.delivery_time === 1 ? '' : 'eis'}`;
      return `<label class="shipping-option${checked ? ' is-selected' : ''}">
        <input type="radio" name="shipping_service" value="${String(q.service_id).replace(/"/g, '&quot;')}" ${checked ? 'checked' : ''}>
        <span class="shipping-option__name"><strong>${q.service_name}</strong><span>${company}${days}</span></span>
        <span class="shipping-option__price"><strong>${brl(q.price)}</strong><span>frete</span></span>
      </label>`;
    }).join('');

    host.querySelectorAll('input[name="shipping_service"]').forEach(input => {
      input.addEventListener('change', () => {
        const q = (quotes || []).find(x => String(x.service_id) === String(input.value));
        if (!q) return;
        saveSelected({
          ...q,
          postal_code: digits(postalCode),
          cart_signature: cartSignature()
        });
        host.querySelectorAll('.shipping-option').forEach(label => label.classList.toggle('is-selected', label.contains(input)));
        message(`${q.service_name} selecionado. O valor será conferido novamente no servidor antes do pagamento.`, 'info');
        updateTotal();
      });
    });
  }

  async function quote() {
    const input = document.getElementById('shipping-postal-code');
    const button = document.getElementById('shipping-quote-btn');
    const postal = digits(input?.value).slice(0, 8);
    if (postal.length !== 8) return message('Informe um CEP com 8 números.', 'error');
    if (!cart().length) return message('Seu carrinho está vazio.', 'error');
    if (!config.configured) return message('O Melhor Envio ainda precisa ser configurado no servidor.', 'error');

    button.disabled = true;
    button.textContent = 'Calculando...';
    message('Consultando transportadoras e prazos...', 'info');
    document.getElementById('shipping-options').innerHTML = '';
    saveSelected(null);
    updateTotal();

    try {
      const response = await fetch('/api/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          postal_code: postal,
          items: cart().map(i => ({ id: i.id, qtd: i.qtd }))
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível calcular o frete.');
      lastQuotedCartSignature = cartSignature();
      renderQuotes(data.quotes, postal);
      message(data.quotes?.length ? 'Escolha uma das opções de entrega abaixo.' : 'Nenhum serviço encontrado.', data.quotes?.length ? 'info' : 'error');
    } catch (error) {
      message(error.message || 'Não foi possível calcular o frete.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Calcular';
    }
  }

  function watchCartChanges() {
    const host = document.getElementById('cart-list');
    if (!host) return;
    let last = cartSignature();
    new MutationObserver(() => {
      const now = cartSignature();
      if (now !== last) {
        last = now;
        if (selected || lastQuotedCartSignature) {
          lastQuotedCartSignature = '';
          document.getElementById('shipping-options').innerHTML = '';
          clearSelection('O carrinho mudou. Calcule o frete novamente.');
        }
      }
      updateTotal();
    }).observe(host, { childList: true, subtree: true, characterData: true });
  }

  function interceptCheckout() {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (input, init = {}) {
      const url = String(input?.url || input || '');
      if (!url.includes('/api/checkout') || String(init.method || 'GET').toUpperCase() !== 'POST') {
        return originalFetch(input, init);
      }

      if (config.configured) {
        if (!selected || selected.cart_signature !== cartSignature()) {
          return new Response(JSON.stringify({ error: 'Calcule e selecione o frete antes de finalizar o pedido.' }), {
            status: 409,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        try {
          const body = JSON.parse(init.body || '{}');
          body.shipping = {
            service_id: selected.service_id,
            postal_code: selected.postal_code
          };
          init = { ...init, body: JSON.stringify(body) };
        } catch {}
      }
      return originalFetch(input, init);
    };
  }

  async function loadConfig() {
    try {
      const response = await fetch('/api/shipping/config', { cache: 'no-store' });
      config = await response.json();
    } catch { config = { configured: false }; }
    const badge = document.getElementById('shipping-config-badge');
    if (badge) {
      badge.classList.toggle('off', !config.configured);
      badge.textContent = config.configured
        ? `Melhor Envio · ${config.environment === 'production' ? 'produção' : 'teste'}`
        : 'Aguardando configuração';
    }
    if (!config.configured) message('O cálculo aparecerá assim que configurarmos o Melhor Envio no Render.', 'info');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    ensureUi();
    loadSelected();
    prefillPostalCode();
    interceptCheckout();
    watchCartChanges();
    await loadConfig();
    if (selected && selected.cart_signature === cartSignature()) {
      updateTotal();
    } else if (selected) {
      clearSelection();
    }

    const subtotalEl = document.getElementById('cart-subtotal');
    const discountEl = document.getElementById('cart-desconto');
    if (subtotalEl || discountEl) {
      const observer = new MutationObserver(updateTotal);
      if (subtotalEl) observer.observe(subtotalEl, { childList: true, characterData: true, subtree: true });
      if (discountEl) observer.observe(discountEl, { childList: true, characterData: true, subtree: true });
    }
    updateTotal();
  });
})();

