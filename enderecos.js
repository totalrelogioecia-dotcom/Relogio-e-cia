(function () {
  'use strict';

  const TOKEN_KEY = 'reloja_auth_token';
  const SESSION_KEY = 'reloja_sessao';
  let addresses = [];
  let editingId = '';

  const digits = value => String(value || '').replace(/\D/g, '');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);

  function formatCep(value) {
    const valueDigits = digits(value).slice(0, 8);
    return valueDigits.length > 5 ? valueDigits.slice(0, 5) + '-' + valueDigits.slice(5) : valueDigits;
  }

  function headers() {
    const result = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) result.Authorization = 'Bearer ' + token;
    return result;
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { ...headers(), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      location.replace('conta.html');
      throw new Error('Entre na sua conta para gerenciar endereços.');
    }
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
    return data;
  }

  function setStatus(message, kind = '') {
    const element = document.getElementById('addresses-status');
    element.textContent = message || '';
    element.className = 'addresses-status' + (kind ? ' ' + kind : '');
  }

  function setFormError(message) {
    document.getElementById('address-form-error').textContent = message || '';
  }

  function updateSession(data) {
    if (!data?.principal_address) return;
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (!session) return;
      session.endereco = data.principal_address;
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {}
  }

  function addressText(address) {
    return esc(address.street_name) + ', ' + esc(address.street_number)
      + (address.complement ? ' — ' + esc(address.complement) : '')
      + '<br>' + esc(address.neighborhood) + ' — ' + esc(address.city_name) + '/' + esc(address.state_code)
      + '<br>CEP ' + esc(formatCep(address.zip_code));
  }

  function render() {
    const list = document.getElementById('address-list');
    if (!addresses.length) {
      list.innerHTML = '<div class="address-empty">Nenhum endereço cadastrado. Use o botão “Adicionar endereço”.</div>';
      return;
    }
    list.innerHTML = addresses.map(address => {
      const id = esc(String(address.id));
      return '<article class="address-card' + (address.principal ? ' is-primary' : '') + '" data-address-id="' + id + '">'
        + '<div class="address-card-head"><h2>' + esc(address.label || 'Endereço') + '</h2>'
        + (address.principal ? '<span class="address-badge">Principal</span>' : '') + '</div>'
        + '<p>' + addressText(address) + '</p>'
        + '<div class="address-card-actions">'
        + '<button type="button" data-action="edit">Editar</button>'
        + (address.principal ? '' : '<button type="button" data-action="default">Tornar principal</button>')
        + (addresses.length > 1 ? '<button type="button" data-action="delete">Excluir</button>' : '')
        + '</div></article>';
    }).join('');
  }

  function field(id) {
    return document.getElementById(id);
  }

  function openForm(id = '') {
    editingId = String(id || '');
    const current = addresses.find(address => String(address.id) === editingId) || {};
    field('address-form-title').textContent = editingId ? 'Editar endereço' : 'Novo endereço';
    field('addr-label').value = current.label || '';
    field('addr-cep').value = formatCep(current.zip_code || '');
    field('addr-uf').value = current.state_code || '';
    field('addr-rua').value = current.street_name || '';
    field('addr-numero').value = current.street_number || '';
    field('addr-complemento').value = current.complement || '';
    field('addr-bairro').value = current.neighborhood || '';
    field('addr-cidade').value = current.city_name || '';
    field('addr-principal').checked = Boolean(current.principal);
    setFormError('');
    const section = field('address-form-section');
    section.hidden = false;
    requestAnimationFrame(() => {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      field(editingId ? 'addr-label' : 'addr-cep').focus({ preventScroll: true });
    });
  }

  function closeForm() {
    editingId = '';
    field('address-form-section').hidden = true;
    setFormError('');
  }

  async function lookupCep() {
    const cep = digits(field('addr-cep').value).slice(0, 8);
    if (cep.length !== 8) return;
    try {
      const response = await fetch('https://viacep.com.br/ws/' + cep + '/json/', { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok || data.erro) return;
      field('addr-rua').value = data.logradouro || '';
      field('addr-bairro').value = data.bairro || '';
      field('addr-cidade').value = data.localidade || '';
      field('addr-uf').value = data.uf || '';
      if (!field('addr-numero').value) field('addr-numero').focus();
    } catch {}
  }

  function payload() {
    return {
      label: field('addr-label').value.trim() || 'Endereço',
      principal: field('addr-principal').checked,
      endereco: {
        zip_code: digits(field('addr-cep').value).slice(0, 8),
        street_name: field('addr-rua').value.trim(),
        street_number: field('addr-numero').value.trim(),
        complement: field('addr-complemento').value.trim(),
        neighborhood: field('addr-bairro').value.trim(),
        city_name: field('addr-cidade').value.trim(),
        state_name: field('addr-uf').value.trim().toUpperCase(),
        state_code: field('addr-uf').value.trim().toUpperCase()
      }
    };
  }

  async function save(event) {
    event.preventDefault();
    const button = field('address-save');
    button.disabled = true;
    setFormError('');
    try {
      const body = payload();
      if (body.endereco.zip_code.length !== 8 || !body.endereco.street_name || !body.endereco.street_number
        || !body.endereco.neighborhood || !body.endereco.city_name || body.endereco.state_code.length !== 2) {
        throw new Error('Preencha CEP, rua, número, bairro, cidade e estado.');
      }
      const url = editingId ? '/api/auth/addresses/' + encodeURIComponent(editingId) : '/api/auth/addresses';
      const data = await api(url, {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify(body)
      });
      addresses = data.addresses || [];
      updateSession(data);
      closeForm();
      render();
      setStatus('Endereço salvo com sucesso.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setFormError(error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function cardAction(button) {
    const card = button.closest('[data-address-id]');
    const id = String(card?.dataset.addressId || '');
    const action = button.dataset.action;
    if (!id) return;
    if (action === 'edit') {
      openForm(id);
      return;
    }
    if (action === 'delete' && !confirm('Excluir este endereço?')) return;

    button.disabled = true;
    try {
      const data = action === 'default'
        ? await api('/api/auth/addresses/' + encodeURIComponent(id) + '/default', { method: 'POST', body: '{}' })
        : await api('/api/auth/addresses/' + encodeURIComponent(id), { method: 'DELETE' });
      addresses = data.addresses || [];
      updateSession(data);
      render();
      setStatus(action === 'default' ? 'Endereço principal atualizado.' : 'Endereço excluído.');
    } catch (error) {
      button.disabled = false;
      setStatus(error.message, 'error');
    }
  }

  async function start() {
    if (!localStorage.getItem(TOKEN_KEY)) {
      location.replace('conta.html');
      return;
    }

    field('address-new').addEventListener('click', () => openForm());
    field('address-cancel').addEventListener('click', closeForm);
    field('address-cancel-top').addEventListener('click', closeForm);
    field('address-form').addEventListener('submit', save);
    field('addr-cep').addEventListener('input', () => {
      field('addr-cep').value = formatCep(field('addr-cep').value);
      if (digits(field('addr-cep').value).length === 8) lookupCep();
    });
    field('addr-cep').addEventListener('blur', lookupCep);
    field('addr-uf').addEventListener('input', () => {
      field('addr-uf').value = field('addr-uf').value.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase();
    });
    field('address-list').addEventListener('click', event => {
      const button = event.target.closest('button[data-action]');
      if (button) cardAction(button);
    });

    try {
      const data = await api('/api/auth/addresses', { method: 'GET' });
      addresses = data.addresses || [];
      updateSession(data);
      render();
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', start);
})();

