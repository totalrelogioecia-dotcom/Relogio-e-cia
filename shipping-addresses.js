/* =========================================================
   RELÓGIO E CIA — seleção de endereço no carrinho
   Usa apenas endereços autenticados da conta.
   ========================================================= */
(function () {
  'use strict';

  const ADDRESS_KEY = 'reloja_endereco_entrega_id';
  let addresses = [];
  let currentId = '';

  const digits = value => String(value || '').replace(/\D/g, '');

  function sessionAddress() {
    try {
      return JSON.parse(localStorage.getItem('reloja_sessao') || 'null')?.endereco || null;
    } catch {
      return null;
    }
  }

  function authHeaders() {
    return { Accept: 'application/json' };
  }

  function formatCep(value) {
    const n = digits(value).slice(0, 8);
    return n.length > 5 ? `${n.slice(0, 5)}-${n.slice(5)}` : n;
  }

  function normalizePlace(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function pickupAllowed(address) {
    const city = normalizePlace(address?.city_name);
    const state = normalizePlace(address?.state_code || address?.state_name);
    return city === 'porto alegre' && (state === 'rs' || state === 'rio grande do sul');
  }

  function publishAddress(address) {
    const allowed = pickupAllowed(address);
    const addressResolved = Boolean(
      normalizePlace(address?.city_name) &&
      normalizePlace(address?.state_code || address?.state_name)
    );
    window.__RELOJA_PICKUP_ALLOWED = allowed;
    window.dispatchEvent(new CustomEvent('reloja:endereco-entrega', {
      detail: {
        address: address || null,
        address_resolved: addressResolved,
        pickup_allowed: allowed
      }
    }));
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
      .shipping-address-picker{margin:0 0 14px;padding:14px;border:1px solid var(--line-strong);background:var(--bg-soft)}
      .shipping-address-picker label{display:block;font-family:var(--font-mono);font-size:.67rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:7px}
      .shipping-address-picker select{width:100%;min-height:42px;border:1px solid var(--ink);background:var(--bg);color:var(--ink);padding:0 11px;font-family:var(--font-body);font-size:.84rem}
      .shipping-address-current{margin:8px 0 0;color:var(--ink-soft);font-size:.72rem;line-height:1.45}
      .shipping-address-manage{display:inline-block;margin-top:8px;font-family:var(--font-mono);font-size:.66rem;color:var(--red);text-underline-offset:3px}
      .shipping-address-retry{margin-top:10px}
      @media(max-width:640px){.shipping-address-picker{padding:12px}.shipping-address-picker select{font-size:16px}}
    `;
    document.head.appendChild(style);
  }

  function ensurePicker() {
    const existing = document.getElementById('shipping-address-picker');
    if (existing) return existing;
    const shippingBox = document.getElementById('shipping-box');
    const form = shippingBox?.querySelector('.shipping-form');
    const slot = document.getElementById('shipping-address-slot');
    if (!shippingBox || !form) return null;
    ensureStyles();
    const box = document.createElement('div');
    box.id = 'shipping-address-picker';
    box.className = 'shipping-address-picker';
    box.setAttribute('aria-live', 'polite');
    if (slot) slot.appendChild(box);
    else shippingBox.insertBefore(box, form);
    return box;
  }

  function showAddressState(state) {
    const box = ensurePicker();
    if (!box) return;
    box.setAttribute('aria-busy', String(state === 'loading'));
    if (state === 'guest') {
      box.innerHTML = '<p class="shipping-address-current">Entre ou crie sua conta para cadastrar um endereço de entrega e finalizar o pedido. Você já pode calcular o frete pelo CEP.</p><a href="conta.html?voltar=carrinho.html" class="shipping-address-manage">Entrar ou criar conta</a>';
    } else if (state === 'empty') {
      box.innerHTML = '<p class="shipping-address-current">Cadastre um endereço de entrega antes de finalizar a compra. Você já pode calcular o frete pelo CEP.</p><a href="enderecos.html" class="shipping-address-manage">Cadastrar endereço</a>';
    } else if (state === 'error') {
      box.innerHTML = '<p class="shipping-address-current">Não foi possível carregar seus endereços. Tente novamente. Você pode calcular o frete pelo CEP.</p><button type="button" class="btn btn-outline shipping-address-retry">Tentar novamente</button>';
      box.querySelector('.shipping-address-retry').addEventListener('click', loadAddresses);
    } else {
      box.innerHTML = '<p class="shipping-address-current" role="status">Carregando endereços...</p>';
    }
  }

  function selectedAddress() {
    return addresses.find(address => address.id === currentId) || null;
  }

  function selectAddress(id, userAction) {
    const next = addresses.find(address => address.id === id) || addresses.find(address => address.principal) || addresses[0] || null;
    if (!next) {
      publishAddress(null);
      return;
    }
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

    publishAddress(next);

    if (userAction && changed) {
      const message = document.getElementById('shipping-message');
      if (message) {
        message.textContent = pickupAllowed(next)
          ? 'Endereço alterado. Escolha Retirar na loja ou calcule o frete novamente para este CEP.'
          : 'Endereço alterado. Calcule o frete novamente para este CEP.';
        message.className = 'shipping-message info';
      }
      document.getElementById('shipping-options').innerHTML = '';
    }
  }

  function renderPicker() {
    const box = ensurePicker();
    if (!box) return;
    box.setAttribute('aria-busy', 'false');
    if (!addresses.length) {
      publishAddress(null);
      showAddressState('empty');
      return;
    }

    box.innerHTML = `
      <label for="shipping-address-select">Endereço de entrega</label>
      <select id="shipping-address-select"></select>
      <p id="shipping-address-current" class="shipping-address-current"></p>
      <a href="enderecos.html" class="shipping-address-manage">Gerenciar endereços</a>`;
    const select = document.getElementById('shipping-address-select');
    select.addEventListener('change', event => selectAddress(event.target.value, true));
    addresses.forEach(address => {
      const suffix = address.principal ? ' · principal' : '';
      const option = document.createElement('option');
      option.value = String(address.id);
      option.textContent = `${String(address.label || 'Endereço')} · ${formatCep(address.zip_code)}${suffix}`;
      select.appendChild(option);
    });

    const saved = sessionStorage.getItem(ADDRESS_KEY) || '';
    const initial = addresses.find(address => address.id === saved) || addresses.find(address => address.principal) || addresses[0];
    selectAddress(initial.id, false);
  }

  async function loadAddresses() {
    showAddressState('loading');
    try {
      const response = await fetch('/api/auth/addresses', {
        headers: authHeaders(),
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (!response.ok) {
        if (response.status === 401) {
          publishAddress(sessionAddress());
          showAddressState('guest');
          return;
        }
        throw new Error('Não foi possível carregar os endereços.');
      }
      const data = await response.json();
      addresses = Array.isArray(data.addresses) ? data.addresses : [];
      renderPicker();
    } catch {
      publishAddress(sessionAddress());
      showAddressState('error');
    }
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
    // A sessão permite mostrar a opção imediatamente; a resposta autenticada
    // da API continua sendo a fonte definitiva logo em seguida.
    publishAddress(sessionAddress());
    installCheckoutAddress();
    setTimeout(loadAddresses, 0);
  });
})();
