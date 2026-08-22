/* =========================================================
   RELÓGIO E CIA — múltiplos endereços da conta
   ========================================================= */
(function () {
  'use strict';

  const TOKEN_KEY = 'reloja_auth_token';
  const SESSION_KEY = 'reloja_sessao';
  let addresses = [];
  let editingId = '';

  const digits = value => String(value || '').replace(/\D/g, '');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c]));
  const token = () => localStorage.getItem(TOKEN_KEY) || '';

  function formatCep(value) {
    const n = digits(value).slice(0, 8);
    return n.length > 5 ? `${n.slice(0, 5)}-${n.slice(5)}` : n;
  }

  function authHeaders(extra = {}) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json', ...extra };
    if (token()) headers.Authorization = `Bearer ${token()}`;
    return headers;
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: authHeaders(options.headers || {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
    return data;
  }

  function ensureStyles() {
    if (document.getElementById('customer-address-styles')) return;
    const style = document.createElement('style');
    style.id = 'customer-address-styles';
    style.textContent = `
      .customer-addresses{margin:22px 0 8px;padding-top:20px;border-top:1px solid rgba(0,0,0,.14)}
      .customer-addresses-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}
      .customer-addresses-head h3{font-family:var(--font-display);font-size:1rem;margin:0}.customer-addresses-head button{padding:9px 12px;font-size:.68rem}
      .customer-address-list{display:grid;gap:10px}.customer-address-card{border:1px solid rgba(0,0,0,.18);padding:13px;background:#fff}
      .customer-address-card.is-primary{border-color:#111;box-shadow:inset 3px 0 0 var(--red)}
      .customer-address-title{display:flex;justify-content:space-between;gap:10px;align-items:center}.customer-address-title strong{font-size:.9rem}.customer-address-badge{font-family:var(--font-mono);font-size:.6rem;text-transform:uppercase;color:var(--red)}
      .customer-address-card p{margin:7px 0 0;color:var(--ink-soft);font-size:.8rem;line-height:1.5}.customer-address-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:11px}
      .customer-address-actions button{border:1px solid #aaa;background:#fff;padding:7px 9px;font-family:var(--font-mono);font-size:.62rem;text-transform:uppercase;cursor:pointer}.customer-address-actions button:hover{border-color:#111}
      .customer-address-form{margin-top:14px;border:1px solid #111;padding:14px;background:#faf9f6}.customer-address-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.customer-address-grid .wide{grid-column:1/-1}.customer-address-form .form-field{margin-bottom:0}.customer-address-form-actions{display:flex;gap:8px;margin-top:12px}.customer-address-form-actions .btn{flex:1;justify-content:center;padding:10px;font-size:.68rem}
      .customer-address-message{display:none;margin:10px 0 0;font-size:.74rem}.customer-address-message.error{display:block;color:var(--red)}.customer-address-message.ok{display:block;color:#087d3e}
      @media(max-width:640px){.customer-addresses-head{align-items:flex-start}.customer-address-grid{grid-template-columns:1fr}.customer-address-grid .wide{grid-column:auto}.customer-address-form-actions{flex-direction:column}.customer-addresses-head button{white-space:nowrap}}
    `;
    document.head.appendChild(style);
  }

  function updateLocalSession(data) {
    if (!data?.principal_address) return;
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (!session) return;
      session.endereco = data.principal_address;
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {}
  }

  function addressText(address) {
    return `${esc(address.street_name)}, ${esc(address.street_number)}${address.complement ? ` — ${esc(address.complement)}` : ''}<br>${esc(address.neighborhood)} — ${esc(address.city_name)}/${esc(address.state_code)}<br>CEP ${esc(formatCep(address.zip_code))}`;
  }

  function ensureHost() {
    const box = document.getElementById('account-box');
    const profile = box?.querySelector('.account-profile');
    if (!box || !profile || document.getElementById('customer-addresses')) return false;
    ensureStyles();
    const host = document.createElement('section');
    host.id = 'customer-addresses';
    host.className = 'customer-addresses';
    host.innerHTML = `
      <div class="customer-addresses-head"><h3>Meus endereços</h3><button type="button" class="btn btn-outline" id="address-new">+ Adicionar</button></div>
      <div id="customer-address-list" class="customer-address-list"></div>
      <div id="customer-address-form-host"></div>
      <p id="customer-address-message" class="customer-address-message"></p>`;
    profile.insertAdjacentElement('afterend', host);
    host.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || !host.contains(button)) return;

      if (button.id === 'address-new') {
        event.preventDefault();
        openForm();
        return;
      }
      if (button.id === 'addr-save') {
        event.preventDefault();
        saveForm();
        return;
      }
      if (button.id === 'addr-cancel') {
        event.preventDefault();
        closeForm();
        return;
      }
      if (button.dataset.action) {
        event.preventDefault();
        handleCardAction(button);
      }
    });
    return true;
  }

  function renderList() {
    if (!ensureHost()) return;
    const list = document.getElementById('customer-address-list');
    if (!list) return;
    list.innerHTML = addresses.map(address => `
      <article class="customer-address-card${address.principal ? ' is-primary' : ''}" data-address-id="${esc(address.id)}">
        <div class="customer-address-title"><strong>${esc(address.label || 'Endereço')}</strong>${address.principal ? '<span class="customer-address-badge">Principal</span>' : ''}</div>
        <p>${addressText(address)}</p>
        <div class="customer-address-actions">
          ${address.principal ? '' : '<button type="button" data-action="default">Tornar principal</button>'}
          <button type="button" data-action="edit">Editar</button>
          ${addresses.length > 1 ? '<button type="button" data-action="delete">Excluir</button>' : ''}
        </div>
      </article>`).join('');

  }

  function showMessage(text, kind = 'ok') {
    const el = document.getElementById('customer-address-message');
    if (!el) return;
    el.textContent = text || '';
    el.className = `customer-address-message ${text ? kind : ''}`;
  }

  function formAddress() {
    const current = addresses.find(address => String(address.id) === String(editingId)) || {};
    return current;
  }

  function openForm(id = '') {
    editingId = id;
    if (!ensureHost()) return;
    const a = formAddress();
    const host = document.getElementById('customer-address-form-host');
    host.innerHTML = `
      <div class="customer-address-form">
        <div class="customer-address-grid">
          <div class="form-field wide"><label>Nome do endereço</label><input id="addr-label" maxlength="40" placeholder="Ex.: Casa ou Trabalho" value="${esc(a.label || '')}"></div>
          <div class="form-field"><label>CEP</label><input id="addr-cep" inputmode="numeric" maxlength="9" value="${esc(formatCep(a.zip_code || ''))}"></div>
          <div class="form-field"><label>UF</label><input id="addr-uf" maxlength="2" value="${esc(a.state_code || '')}"></div>
          <div class="form-field wide"><label>Rua</label><input id="addr-rua" value="${esc(a.street_name || '')}"></div>
          <div class="form-field"><label>Número</label><input id="addr-numero" value="${esc(a.street_number || '')}"></div>
          <div class="form-field"><label>Complemento</label><input id="addr-complemento" value="${esc(a.complement || '')}"></div>
          <div class="form-field"><label>Bairro</label><input id="addr-bairro" value="${esc(a.neighborhood || '')}"></div>
          <div class="form-field"><label>Cidade</label><input id="addr-cidade" value="${esc(a.city_name || '')}"></div>
          <label class="wide" style="font-size:.78rem;display:flex;gap:8px;align-items:center"><input id="addr-principal" type="checkbox" ${a.principal ? 'checked' : ''}> Usar como endereço principal</label>
        </div>
        <div class="customer-address-form-actions"><button type="button" class="btn btn-primary" id="addr-save">Salvar endereço</button><button type="button" class="btn btn-outline" id="addr-cancel">Cancelar</button></div>
      </div>`;

    const cep = document.getElementById('addr-cep');
    const uf = document.getElementById('addr-uf');
    cep.addEventListener('input', () => { cep.value = formatCep(cep.value); if (digits(cep.value).length === 8) lookupCep(); });
    cep.addEventListener('blur', lookupCep);
    uf.addEventListener('input', () => { uf.value = uf.value.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase(); });
    const form = host.querySelector('.customer-address-form');
    requestAnimationFrame(() => {
      form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById(editingId ? 'addr-label' : 'addr-cep')?.focus({ preventScroll: true });
    });
  }

  function closeForm() {
    editingId = '';
    const host = document.getElementById('customer-address-form-host');
    if (host) host.innerHTML = '';
  }

  async function lookupCep() {
    const cep = digits(document.getElementById('addr-cep')?.value).slice(0, 8);
    if (cep.length !== 8) return;
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok || data.erro) return;
      document.getElementById('addr-rua').value = data.logradouro || '';
      document.getElementById('addr-bairro').value = data.bairro || '';
      document.getElementById('addr-cidade').value = data.localidade || '';
      document.getElementById('addr-uf').value = data.uf || '';
    } catch {}
  }

  function payloadFromForm() {
    return {
      label: document.getElementById('addr-label').value.trim() || 'Endereço',
      principal: document.getElementById('addr-principal').checked,
      endereco: {
        zip_code: digits(document.getElementById('addr-cep').value).slice(0, 8),
        street_name: document.getElementById('addr-rua').value.trim(),
        street_number: document.getElementById('addr-numero').value.trim(),
        complement: document.getElementById('addr-complemento').value.trim(),
        neighborhood: document.getElementById('addr-bairro').value.trim(),
        city_name: document.getElementById('addr-cidade').value.trim(),
        state_name: document.getElementById('addr-uf').value.trim().toUpperCase(),
        state_code: document.getElementById('addr-uf').value.trim().toUpperCase()
      }
    };
  }

  async function saveForm() {
    try {
      const payload = payloadFromForm();
      const url = editingId ? `/api/auth/addresses/${encodeURIComponent(editingId)}` : '/api/auth/addresses';
      const data = await api(url, { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      addresses = data.addresses || [];
      updateLocalSession(data);
      closeForm();
      renderList();
      showMessage('Endereço salvo com sucesso.', 'ok');
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  async function handleCardAction(button) {
    const card = button.closest('[data-address-id]');
    const id = String(card?.dataset.addressId || '');
    const action = button.dataset.action;
    if (!id) return;
    if (action === 'edit') return openForm(id);
    if (action === 'delete' && !confirm('Excluir este endereço?')) return;

    try {
      const data = action === 'default'
        ? await api(`/api/auth/addresses/${encodeURIComponent(id)}/default`, { method: 'POST', body: '{}' })
        : await api(`/api/auth/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' });
      addresses = data.addresses || [];
      updateLocalSession(data);
      renderList();
      showMessage(action === 'default' ? 'Endereço principal atualizado.' : 'Endereço excluído.', 'ok');
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  async function load() {
    if (!token()) return;
    try {
      const data = await api('/api/auth/addresses', { method: 'GET', headers: {} });
      addresses = data.addresses || [];
      updateLocalSession(data);
      renderList();
    } catch {}
  }

  function observeAccountBox() {
    const box = document.getElementById('account-box');
    if (!box) return;
    let scheduled = false;
    const refresh = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        if (box.querySelector('.account-profile') && !document.getElementById('customer-addresses')) load();
      }, 0);
    };
    new MutationObserver(refresh).observe(box, { childList: true, subtree: true });
    refresh();
  }

  document.addEventListener('DOMContentLoaded', observeAccountBox);
})();

