(() => {
  'use strict';

  const TOKEN_KEY = 'reloja_admin_token';
  const ROLE_LABELS = {
    owner: 'Proprietário',
    manager: 'Gerente',
    atendimento: 'Atendimento'
  };
  let currentAdmin = null;
  let users = [];
  let editingId = '';

  const $ = selector => document.querySelector(selector);

  function esc(value) {
    return String(value ?? '').replace(/[&<>\"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function date(value) {
    if (!value) return 'Nunca';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('pt-BR');
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
    return data;
  }

  function addStyles() {
    if ($('#admin-users-management-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-users-management-style';
    style.textContent = `
      .admin-user-badge{display:inline-flex;align-items:center;gap:6px;margin-right:10px;padding:7px 10px;border:1px solid rgba(0,0,0,.12);border-radius:999px;font-size:.74rem;background:#fff}
      .admin-user-status{display:inline-block;padding:4px 8px;border-radius:999px;font-size:.72rem;font-weight:700}.admin-user-status.active{background:#edf7ef;color:#245d35}.admin-user-status.blocked{background:#fff0ee;color:#8d2119}
      .admin-user-role{display:inline-block;padding:4px 8px;border:1px solid rgba(0,0,0,.12);border-radius:999px;font-size:.72rem;white-space:nowrap}
      .admin-users-help{max-width:820px;line-height:1.5}.admin-users-help strong{color:#1f1f1f}
      .admin-users-actions{display:flex;gap:6px;flex-wrap:wrap}.admin-users-actions button{white-space:nowrap}
      .admin-user-editor-note{margin-top:8px;font-size:.78rem;line-height:1.45;color:#5d5d5d}
      @media(max-width:760px){.admin-user-badge{display:none}.admin-users-actions{min-width:180px}}
    `;
    document.head.appendChild(style);
  }

  function roleLabel(level) {
    return ROLE_LABELS[level] || 'Atendimento';
  }

  function roleHelp() {
    return '<strong>Proprietário:</strong> acesso completo e gerenciamento de usuários. <strong>Gerente:</strong> operação da loja, sem gerenciar usuários, sem excluir produto permanentemente e sem alterar integração do Melhor Envio. <strong>Atendimento:</strong> consulta do painel e atualização de atendimento, pós-venda, avaliações, confirmações e andamento de envio.';
  }

  function ensureBadge() {
    if (!currentAdmin || $('#admin-user-badge')) return;
    const logout = $('#logout-btn');
    if (!logout?.parentElement) return;
    const badge = document.createElement('span');
    badge.id = 'admin-user-badge';
    badge.className = 'admin-user-badge';
    badge.textContent = `${currentAdmin.name || currentAdmin.email} · ${roleLabel(currentAdmin.access_level)}`;
    logout.parentElement.insertBefore(badge, logout);
  }

  function ensureUi() {
    if (!currentAdmin || currentAdmin.access_level !== 'owner') return;
    const tabs = $('.admin-tabs');
    const dashboard = $('#dashboard');
    if (!tabs || !dashboard) return;

    if (!tabs.querySelector('[data-tab="usuarios-admin"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.tab = 'usuarios-admin';
      button.textContent = '👥 Usuários do Admin';
      button.style.display = 'none';
      tabs.appendChild(button);
    }

    if (!$('#tab-usuarios-admin')) {
      const panel = document.createElement('div');
      panel.id = 'tab-usuarios-admin';
      panel.style.display = 'none';
      panel.innerHTML = `
        <div class="admin-toolbar">
          <div><h2>Usuários do Admin</h2><p class="admin-muted admin-users-help">Crie um login separado para cada pessoa. ${roleHelp()}</p></div>
          <button id="novo-admin-user" class="btn btn-primary" type="button">+ Novo usuário</button>
        </div>
        <div id="admin-user-editor" class="admin-card" style="display:none">
          <h3 id="admin-user-editor-title">Novo usuário</h3>
          <div id="admin-user-editor-error" class="form-error" style="display:none"></div>
          <div class="admin-grid">
            <div class="form-field"><label for="admin-user-name">Nome</label><input id="admin-user-name" maxlength="100" autocomplete="off"></div>
            <div class="form-field"><label for="admin-user-email">E-mail</label><input id="admin-user-email" type="email" maxlength="180" autocomplete="off"></div>
            <div class="form-field"><label for="admin-user-role">Nível de acesso</label><select id="admin-user-role"><option value="owner">Proprietário</option><option value="manager">Gerente</option><option value="atendimento">Atendimento</option></select></div>
            <div class="form-field"><label for="admin-user-password">Senha</label><input id="admin-user-password" type="password" minlength="10" maxlength="200" autocomplete="new-password" placeholder="Mínimo de 10 caracteres"></div>
          </div>
          <p id="admin-user-password-help" class="admin-user-editor-note">A senha é obrigatória para criar o usuário e fica armazenada de forma protegida, nunca em texto puro.</p>
          <div class="editor-actions"><button id="salvar-admin-user" class="btn btn-primary" type="button">Salvar usuário</button><button id="cancelar-admin-user" class="btn btn-outline" type="button">Cancelar</button></div>
        </div>
        <div id="admin-users-list" class="admin-table-wrap"></div>`;
      dashboard.appendChild(panel);
    }

    const usersButton = tabs.querySelector('[data-tab="usuarios-admin"]');
    usersButton.onclick = openUsersTab;
    tabs.querySelectorAll('button').forEach(button => {
      if (button === usersButton || button.dataset.adminUsersBound === '1') return;
      button.dataset.adminUsersBound = '1';
      button.addEventListener('click', () => {
        const panel = $('#tab-usuarios-admin');
        if (panel) panel.style.display = 'none';
      });
    });

    $('#novo-admin-user').onclick = () => openEditor();
    $('#salvar-admin-user').onclick = saveUser;
    $('#cancelar-admin-user').onclick = closeEditor;
  }

  function applyRoleVisibility() {
    if (!currentAdmin) return;
    if (currentAdmin.access_level === 'atendimento') {
      ['produtos', 'cupons', 'audit'].forEach(tab => {
        const button = document.querySelector(`.admin-tabs [data-tab="${tab}"]`);
        if (button) button.style.display = 'none';
      });
    }
  }

  function openUsersTab() {
    document.querySelectorAll('#dashboard > [id^="tab-"]').forEach(panel => { panel.style.display = 'none'; });
    document.querySelectorAll('.admin-tabs button').forEach(button => button.classList.toggle('active', button.dataset.tab === 'usuarios-admin'));
    const panel = $('#tab-usuarios-admin');
    if (panel) panel.style.display = 'block';
    loadUsers();
  }

  function showEditorError(message) {
    const box = $('#admin-user-editor-error');
    if (!box) return;
    box.textContent = message || '';
    box.style.display = message ? 'block' : 'none';
  }

  function openEditor(user = null) {
    editingId = user?.id || '';
    $('#admin-user-editor-title').textContent = user ? 'Editar usuário' : 'Novo usuário';
    $('#admin-user-name').value = user?.name || '';
    $('#admin-user-email').value = user?.email || '';
    $('#admin-user-role').value = user?.access_level || 'atendimento';
    $('#admin-user-password').value = '';
    $('#admin-user-password').placeholder = user ? 'Deixe em branco para manter a senha' : 'Mínimo de 10 caracteres';
    $('#admin-user-password-help').textContent = user
      ? 'Preencha a senha somente se quiser redefinir o acesso deste usuário.'
      : 'A senha é obrigatória para criar o usuário e fica armazenada de forma protegida, nunca em texto puro.';
    const self = user && currentAdmin && user.id === currentAdmin.id;
    $('#admin-user-email').disabled = Boolean(self);
    $('#admin-user-role').disabled = Boolean(self);
    showEditorError('');
    $('#admin-user-editor').style.display = 'block';
    $('#admin-user-name').focus();
  }

  function closeEditor() {
    editingId = '';
    const editor = $('#admin-user-editor');
    if (editor) editor.style.display = 'none';
    showEditorError('');
  }

  async function saveUser() {
    const name = $('#admin-user-name').value.trim();
    const email = $('#admin-user-email').value.trim();
    const access_level = $('#admin-user-role').value;
    const password = $('#admin-user-password').value;
    const button = $('#salvar-admin-user').onclick;
    void button;
    if (!name || !email) return showEditorError('Nome e e-mail são obrigatórios.');
    if (!editingId && password.length < 10) return showEditorError('A senha precisa ter pelo menos 10 caracteres.');

    try {
      const payload = { name, email, access_level };
      if (password) payload.password = password;
      await api(editingId ? `/api/admin/users/${encodeURIComponent(editingId)}` : '/api/admin/users', {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      closeEditor();
      await loadUsers();
    } catch (error) {
      showEditorError(error.message);
    }
  }

  async function loadUsers() {
    try {
      const data = await api('/api/admin/users');
      users = Array.isArray(data.users) ? data.users : [];
      renderUsers();
    } catch (error) {
      const list = $('#admin-users-list');
      if (list) list.innerHTML = `<div class="form-error">${esc(error.message)}</div>`;
    }
  }

  function renderUsers() {
    const list = $('#admin-users-list');
    if (!list) return;
    if (!users.length) {
      list.innerHTML = '<p class="admin-muted">Nenhum usuário administrativo cadastrado.</p>';
      return;
    }
    list.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Usuário</th><th>Acesso</th><th>Status</th><th>Último login</th><th>Ações</th></tr></thead>
        <tbody>${users.map(user => `
          <tr>
            <td><strong>${esc(user.name || 'Sem nome')}</strong><br><span class="admin-muted">${esc(user.email)}</span></td>
            <td><span class="admin-user-role">${esc(roleLabel(user.access_level))}</span></td>
            <td><span class="admin-user-status ${user.is_active ? 'active' : 'blocked'}">${user.is_active ? 'Ativo' : 'Bloqueado'}</span></td>
            <td>${esc(date(user.last_login_at))}</td>
            <td><div class="admin-users-actions"><button type="button" class="btn btn-outline" data-user-edit="${esc(user.id)}">Editar</button>${user.id !== currentAdmin?.id ? `<button type="button" class="btn btn-outline" data-user-toggle="${esc(user.id)}">${user.is_active ? 'Bloquear' : 'Ativar'}</button>` : ''}</div></td>
          </tr>`).join('')}</tbody>
      </table>`;
    list.querySelectorAll('[data-user-edit]').forEach(button => {
      button.addEventListener('click', () => openEditor(users.find(user => user.id === button.dataset.userEdit)));
    });
    list.querySelectorAll('[data-user-toggle]').forEach(button => {
      button.addEventListener('click', () => toggleUser(button.dataset.userToggle));
    });
  }

  async function toggleUser(id) {
    const user = users.find(item => item.id === id);
    if (!user) return;
    try {
      await api(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !user.is_active })
      });
      await loadUsers();
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function syncAdmin() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    try {
      const data = await api('/api/admin/session');
      if (!data?.authenticated || !data.admin) return;
      currentAdmin = data.admin;
      ensureBadge();
      ensureUi();
      applyRoleVisibility();
    } catch {
      // The main admin shell handles the session state.
    }
  }

  function bindLoginRefresh() {
    const login = $('#login-btn');
    if (!login || login.dataset.usersRefreshBound === '1') return;
    login.dataset.usersRefreshBound = '1';
    login.addEventListener('click', () => setTimeout(syncAdmin, 350));
  }

  function boot() {
    addStyles();
    syncAdmin();
    bindLoginRefresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
