/* =========================================================
   RELÓGIO E CIA — ponte de retirada na loja
   Redundância intencional: garante que o checkout receba o modo
   pickup mesmo se outro script substituir/interceptar window.fetch.
   ========================================================= */
(function () {
  'use strict';

  const SHIPPING_KEY = 'reloja_frete_selecionado';

  function pickupSelected() {
    const input = document.getElementById('shipping-pickup-input');
    if (input?.checked) return true;
    try {
      const selected = JSON.parse(sessionStorage.getItem(SHIPPING_KEY) || 'null');
      return selected?.mode === 'pickup' || String(selected?.service_id || '') === 'pickup';
    } catch {
      return false;
    }
  }

  function clearOldCheckoutError() {
    const message = document.getElementById('cart-msg');
    if (!message) return;
    const text = String(message.textContent || '').toLowerCase();
    if (!text.includes('frete') && !text.includes('entrega')) return;
    message.textContent = '';
    message.className = '';
    message.style.display = 'none';
  }

  document.addEventListener('change', event => {
    if (event.target?.id === 'shipping-pickup-input' && event.target.checked) {
      clearOldCheckoutError();
    }
  });

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init = {}) {
    const url = String(input?.url || input || '');
    const method = String(init.method || 'GET').toUpperCase();
    if (!url.includes('/api/checkout') || method !== 'POST' || !pickupSelected()) {
      return originalFetch(input, init);
    }

    clearOldCheckoutError();
    try {
      const body = JSON.parse(init.body || '{}');
      body.shipping = { ...(body.shipping || {}), mode: 'pickup' };
      init = { ...init, body: JSON.stringify(body) };
    } catch (_) {}

    return originalFetch(input, init);
  };
})();
