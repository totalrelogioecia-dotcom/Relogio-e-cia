/* =========================================================
   RELÓGIO E CIA — frete automático no carrinho
   Cotação via backend + Melhor Envio. O token nunca vai ao navegador.
   ========================================================= */
(function () {
  const CART_KEY = 'reloja_carrinho';
  const SESSION_KEY = 'reloja_sessao';
  const SHIPPING_KEY = 'reloja_frete_selecionado';
  const PICKUP_SERVICE_ID = 'pickup';
  let config = { configured: false };
  let selected = null;
  let lastQuotedCartSignature = '';
  let pickupAllowedForAddress = Boolean(window.__RELOJA_PICKUP_ALLOWED);

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

  function pickupSelected() {
    return selected?.mode === 'pickup' || String(selected?.service_id || '') === PICKUP_SERVICE_ID;
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

  function setPickupVisual(active) {
    const input = document.getElementById('shipping-pickup-input');
    const label = document.getElementById('shipping-pickup-option');
    if (input) input.checked = Boolean(active);
    if (label) label.classList.toggle('is-selected', Boolean(active));
  }

  function setPickupAvailability(allowed, showMessage = false) {
    pickupAllowedForAddress = Boolean(allowed);
    const input = document.getElementById('shipping-pickup-input');
    const label = document.getElementById('shipping-pickup-option');
    const options = document.getElementById('shipping-pickup-options');
    const note = document.getElementById('shipping-pickup-availability');
    if (options) {
      options.hidden = !pickupAllowedForAddress;
      options.style.display = pickupAllowedForAddress ? '' : 'none';
      options.setAttribute('aria-hidden', String(!pickupAllowedForAddress));
    }
    if (input) input.disabled = !pickupAllowedForAddress;
    if (label) label.classList.toggle('is-disabled', !pickupAllowedForAddress);
    if (note) {
      note.textContent = pickupAllowedForAddress
        ? 'Disponível para o endereço selecionado em Porto Alegre/RS.'
        : 'Disponível somente para endereços em Porto Alegre/RS.';
    }
    if (!pickupAllowedForAddress && pickupSelected()) {
      clearSelection(showMessage ? 'A retirada na loja está disponível somente para endereços em Porto Alegre/RS.' : '');
    }
  }

  function selectPickup() {
    if (!pickupAllowedForAddress) {
      setPickupVisual(false);
      return message('A retirada na loja está disponível somente para endereços em Porto Alegre/RS.', 'error');
    }
    saveSelected({
      mode: 'pickup',
      service_id: PICKUP_SERVICE_ID,
      service_name: 'Retirada na loja',
      company_name: 'Relógio e Cia',
      price: 0,
      delivery_time: null,
      postal_code: null,
      cart_signature: cartSignature()
    });
    document.querySelectorAll('#shipping-options .shipping-option').forEach(x => x.classList.remove('is-selected'));
    document.querySelectorAll('#shipping-options input[name="shipping_service"]').forEach(x => { x.checked = false; });
    setPickupVisual(true);
    message('Retirada na loja selecionada. Você poderá pagar normalmente e o frete será R$ 0,00.', 'info');
    updateTotal();
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
        <div><strong>Entrega ou retirada</strong><div class="shipping-help">Escolha como deseja receber seu pedido.</div></div>
        <span class="shipping-config-badge off" id="shipping-config-badge">Melhor Envio</span>
      </div>
      <div class="shipping-options shipping-pickup-options" id="shipping-pickup-options" hidden aria-hidden="true" style="display:none">
        <label class="shipping-option is-disabled" id="shipping-pickup-option">
          <input type="radio" name="shipping_service" value="pickup" id="shipping-pickup-input" disabled>
          <span class="shipping-option__name"><strong>Retirar na loja</strong><span>Av. Cristóvão Colombo, 545 · Porto Alegre</span><span id="shipping-pickup-availability">Disponível somente para endereços em Porto Alegre/RS.</span></span>
          <span class="shipping-option__price"><strong>Grátis</strong><span>R$ 0,00</span></span>
        </label>
      </div>
      <div class="shipping-form">
        <input id="shipping-postal-code" inputmode="numeric" maxlength="9" placeholder="CEP de entrega" aria-label="CEP de entrega">
        <button id="shipping-quote-btn" type="button">Calcular entrega</button>
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
      shippingRow.innerHTML = '<span id="cart-shipping-label">Frete</span><span id="cart-shipping">R$ 0,00</span>';
      totalRow.parentNode.insertBefore(shippingRow, totalRow);
    }

    const pickupInput = document.getElementById('shipping-pickup-input');
    pickupInput?.addEventListener('change', () => {
      if (pickupInput.checked) selectPickup();
    });

    const input = document.getElementById('shipping-postal-code');
    input.addEventListener('input', () => {
      input.value = formatCep(input.value);
      if (selected && !pickupSelected() && digits(input.value) !== digits(selected.postal_code)) {
        clearSelection('O CEP mudou. Calcule o frete novamente.');
      }
    });
    document.getElementById('shipping-quote-btn').addEventListener('click', quote);
    document.getElementById('payment-form')?.addEventListener('change', updateTotal);
    setPickupAvailability(Boolean(window.__RELOJA_PICKUP_ALLOWED));
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
    setPickupVisual(false);
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
    const label = document.getElementById('cart-shipping-label');
    const value = document.getElementById('cart-shipping');
    if (row && value) {
      if (label) label.textContent = pickupSelected() ? 'Retirada na loja' : 'Frete';
      value.textContent = pickupSelected() ? 'Grátis' : brl(freight);
      row.classList.toggle('is-visible', Boolean(selected));
    }
  }

  function renderQuotes(quotes, postalCode) {
    const host = document.getElementById('shipping-options');
    host.innerHTML = (quotes || []).map(q => {
      const checked = selected && !pickupSelected() && String(selected.service_id) === String(q.service_id);
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
        setPickupVisual(false);
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
    if (!config.configured) {
      return message(
        pickupAllowedForAddress
          ? 'O Melhor Envio ainda precisa ser configurado no servidor. Você pode escolher Retirar na loja.'
          : 'O cálculo de entrega ainda não está disponível. A retirada na loja é exclusiva para endereços em Porto Alegre/RS.',
        'error'
      );
    }

    button.disabled = true;
    button.textContent = 'Calculando...';
    message('Consultando transportadoras e prazos...', 'info');
    document.getElementById('shipping-options').innerHTML = '';
    saveSelected(null);
    setPickupVisual(false);
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
      const hasQuotes = Boolean(data.quotes?.length);
      const suffix = pickupAllowedForAddress ? ' ou Retirar na loja.' : '.';
      message(hasQuotes ? `Escolha uma das opções de entrega abaixo${suffix}` : (pickupAllowedForAddress ? 'Nenhum serviço encontrado. Você pode Retirar na loja.' : 'Nenhum serviço de entrega foi encontrado para este CEP.'), hasQuotes ? 'info' : 'error');
    } catch (error) {
      message(`${error.message || 'Não foi possível calcular o frete.'}${pickupAllowedForAddress ? ' Você pode escolher Retirar na loja.' : ''}`, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Calcular entrega';
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
          clearSelection('O carrinho mudou. Escolha novamente a entrega ou retirada.');
        }
      }
      updateTotal();
    }).observe(host, { childList: true, subtree: true, characterData: true });
  }

  function checkoutBlockedResponse() {
    return new Response(JSON.stringify({ error: 'Escolha como receber seu pedido: selecione uma opção de entrega ou retire na loja para continuar.' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  function interceptCheckout() {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (input, init = {}) {
      const url = String(input?.url || input || '');
      if (!url.includes('/api/checkout') || String(init.method || 'GET').toUpperCase() !== 'POST') {
        return originalFetch(input, init);
      }

      if (selected && selected.cart_signature !== cartSignature()) return checkoutBlockedResponse();

      try {
        const body = JSON.parse(init.body || '{}');
        if (pickupSelected()) {
          if (!pickupAllowedForAddress) {
            return new Response(JSON.stringify({ error: 'A retirada na loja está disponível somente para endereços em Porto Alegre/RS.' }), {
              status: 409,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          body.shipping = { mode: 'pickup', service_id: 'pickup' };
          init = { ...init, body: JSON.stringify(body) };
        } else if (config.configured) {
          if (!selected) return checkoutBlockedResponse();
          body.shipping = {
            service_id: selected.service_id,
            postal_code: selected.postal_code
          };
          init = { ...init, body: JSON.stringify(body) };
        } else {
          return checkoutBlockedResponse();
        }
      } catch {}

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
        : 'Entrega aguardando configuração';
    }
    if (!config.configured) {
      message(
        pickupAllowedForAddress
          ? 'O cálculo de entrega aparecerá quando o Melhor Envio estiver configurado. A retirada na loja está disponível para este endereço.'
          : 'O cálculo de entrega aparecerá quando o Melhor Envio estiver configurado. A retirada na loja é exclusiva para Porto Alegre/RS.',
        'info'
      );
    }
  }

  window.addEventListener('reloja:endereco-entrega', event => {
    setPickupAvailability(Boolean(event.detail?.pickup_allowed), true);
  });

  document.addEventListener('DOMContentLoaded', async () => {
    ensureUi();
    loadSelected();
    prefillPostalCode();
    interceptCheckout();
    watchCartChanges();
    await loadConfig();
    setPickupAvailability(Boolean(window.__RELOJA_PICKUP_ALLOWED));
    if (selected && selected.cart_signature === cartSignature()) {
      if (pickupSelected() && pickupAllowedForAddress) setPickupVisual(true);
      else if (pickupSelected()) clearSelection();
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
