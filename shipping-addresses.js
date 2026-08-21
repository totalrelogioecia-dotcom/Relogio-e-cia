/* =========================================================
   RELÓGIO E CIA — seleção de endereço no carrinho
   Usa apenas endereços autenticados da conta.
   ========================================================= */
(function () {
  'use strict';

  const TOKEN_KEY = 'reloja_auth_token';
  const ADDRESS_KEY = 'reloja_endereco_entrega_id';
  let addresses = [];
  let currentId = '';

  const digits = value => String(value || '').replace(/\D/g, '');
  const token = () => localStorage.getItem(TOKEN_KEY) || '';

  function authHeaders() {
    const headers = { Accept: 'application/json' };
    if (token()) headers.Authorization = `Bearer ${token()}`;
    return headers;
  }

  function formatCep(value) {
    const n = digits(value).slice(0, 8);
    return n.length > 5 ? `${n.slice(0, 5)}-${n.slice(5)}` : n;
  }

  function formatAddress(address) {
    const line1 = `${address.street_name}, ${address.street_number}${address.complement ? ` — ${address.complement}` : ''}`;
    const line2 = `${address.neighborhood} — ${address.city_name}/${address.state_code}`;
    return `${line1} · ${line2} · CEP ${formatCep(address.zip_code)}`;
  }

  function ensureStyles() {
    if (document.getElementById('shipping-address-styles')) return;
    const style = document.createElement('style');
    style.id = 'shipping-address-styles';
    style.textContent = `
      .shipping-address-picker{margin:0 0 14px;padding:14px;border:1px solid rgba(0,0,0,.14);background:#faf9f6}
      .shipping-address-picker label{display:block;font-family:var(--font-mono);font-size:.67rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:7px}
      .shipping-address-picker select{width:100%;min-height:42px;border:1px solid #111;background:#fff;padding:0 11px;font-family:var(--font-body);font-size:.84rem}
      .shipping-address-current{margin:8px 0 0;color:var(--ink-soft);font-size:.72rem;line-height:1.45}
      .shipping-address-manage{display:inline-block;margin-top:8px;font-family:var(--font-mono);font-size:.66rem;color:var(--red);text-underline-offset:3px}
      @media(max-width:640px){.shipping-address-picker{padding:12px}.shipping-address-picker select{font-size:16px}}
    `;
    document.head.appendChild(style);
  }

  function ensurePicker() {
    const shippingBox = document.getElementById('shipping-box');
    const form = shippingBox?.querySelector('.shipping-form');
    if (!shippingBox || !form || document.getElementById('shipping-address-picker')) return;
    ensureStyles();
    const box = document.createElement('div');
    box.id = 'shipping-address-picker';
    box.className = 'shipping-address-picker';
    box.innerHTML = `
      <label for="shipping-address-select">Endereço de entrega</label>
      <select id="shipping-address-select"></select>
      <p id="shipping-address-current" class="shipping-address-current"></p>
      <a href="conta.html" class="shipping-address-manage">Gerenciar endereços</a>`;
    shippingBox.insertBefore(box, form);
    document.getElementById('shipping-address-select').addEventListener('change', event => selectAddress(event.target.value, true));
  }

  function selectedAddress() {
    return addresses.find(address => address.id === currentId) || null;
  }

  function selectAddress(id, userAction) {
    const next = addresses.find(address => address.id === id) || addresses.find(address => address.principal) || addresses[0] || null;
    if (!next) return;
    const changed = currentId && currentId !== next.id;
    currentId = next.id;
    sessionStorage.setItem(ADDRESS_KEY, currentId);

    const select = document.getElementById('shipping-address-select');
    if (select && select.value !== currentId) select.value = currentId;
    const current = document.getElementById('shipping-address-current');
    if (current) current.textContent = formatAddress(next);

    const postal = document.getElementById('shipping-postal-code');
    if (postal) {
      postal.readOnly = true;
      postal.value = formatCep(next.zip_code);
      postal.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const note = document.getElementById('shipping-lock-note');
    if (note) {
      note.textContent = 'O frete e o pedido usarão o endereço selecionado acima.';
      note.style.display = 'block';
    }

    if (userAction && changed) {
      const message = document.getElementById('shipping-message');
      if (message) {
        message.textContent = 'Endereço alterado. Calcule o frete novamente para este CEP.';
        message.className = 'shipping-message info';
      }
      document.getElementById('shipping-options').innerHTML = '';
    }
  }

  function renderPicker() {
    ensurePicker();
    const select = document.getElementById('shipping-address-select');
    if (!select) return;
    if (!addresses.length) {
      document.getElementById('shipping-address-picker').innerHTML = '<p class="shipping-address-current">Cadastre um endereço de entrega na sua conta antes de finalizar a compra.</p><a href="conta.html" class="shipping-address-manage">Cadastrar endereço</a>';
      return;
    }

    select.innerHTML = addresses.map(address => {
      const suffix = address.principal ? ' · principal' : '';
      return `<option value="${String(address.id).replace(/"/g, '&quot;')}">${String(address.label || 'Endereço').replace(/</g, '&lt;')} · ${formatCep(address.zip_code)}${suffix}</option>`;
    }).join('');

    const saved = sessionStorage.getItem(ADDRESS_KEY) || '';
    const initial = addresses.find(address => address.id === saved) || addresses.find(address => address.principal) || addresses[0];
    selectAddress(initial.id, false);
  }

  async function loadAddresses() {
    try {
      const response = await fetch('/api/auth/addresses', {
        headers: authHeaders(),
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (!response.ok) return;
      const data = await response.json();
      addresses = Array.isArray(data.addresses) ? data.addresses : [];
      renderPicker();
    } catch {}
  }

  function installCheckoutAddress() {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (input, init = {}) {
      const url = String(input?.url || input || '');
      const method = String(init.method || 'GET').toUpperCase();
      if (!url.includes('/api/checkout') || method !== 'POST') return originalFetch(input, init);

      const address = selectedAddress();
      if (address) {
        try {
          const body = JSON.parse(init.body || '{}');
          body.shipping = { ...(body.shipping || {}), address_id: address.id };
          body.delivery_address_id = address.id;
          init = { ...init, body: JSON.stringify(body) };
        } catch {}
      }
      return originalFetch(input, init);
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    installCheckoutAddress();
    setTimeout(loadAddresses, 0);
  });
})();
