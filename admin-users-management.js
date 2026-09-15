(() => {
  'use strict';

  const TOKEN_KEY = 'reloja_admin_token';
  const ROLE_LABELS = { owner: 'Proprietário', manager: 'Gerente', atendimento: 'Atendimento' };
  let currentAdmin = null;
  let users = [];
  let editingId = '';
  let modalResolve = null;

  const $ = selector => document.querySelector(selector);

  function esc(value) {
    return String(value ?? '').replace(/[&<>\"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
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
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
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
      #tab-usuarios-admin{margin-top:18px;background:#fff;color:#111;border:2px solid #111;box-shadow:0 18px 45px rgba(0,0,0,.14);padding:20px}
      #tab-usuarios-admin .admin-toolbar{background:#fff;border:2px solid #111;padding:18px;margin-bottom:14px}
      #tab-usuarios-admin h2,#tab-usuarios-admin h3{color:#111;margin-top:0}
      #tab-usuarios-admin .admin-muted,#tab-usuarios-admin .admin-users-help,#tab-usuarios-admin .admin-user-editor-note{color:#333}
      #tab-usuarios-admin .admin-card{background:#f7f7f7;border:2px solid #111;color:#111;padding:18px}
      #tab-usuarios-admin label{color:#111;font-weight:800}
      #tab-usuarios-admin input,#tab-usuarios-admin select{background:#fff;color:#111;border:2px solid #111}
      #tab-usuarios-admin input:focus,#tab-usuarios-admin select:focus{border-color:#e31e24;outline:3px solid rgba(227,30,36,.18)}
      #tab-usuarios-admin .admin-table-wrap{border:2px solid #111;background:#fff;overflow-x:auto}
      #tab-usuarios-admin .admin-table{width:100%;min-width:760px;border-collapse:collapse;color:#111}
      #tab-usuarios-admin .admin-table th{background:#111;color:#fff;border-bottom:3px solid #e31e24;text-align:left;font-weight:900;padding:13px}
      #tab-usuarios-admin .admin-table td{background:#fff;color:#111;border-bottom:1px solid #cfcfcf;padding:12px;vertical-align:middle}
      #tab-usuarios-admin .admin-table tr:nth-child(even) td{background:#f5f5f5}
      #tab-usuarios-admin .admin-table tr:hover td{background:#ffecee}
      #tab-usuarios-admin .admin-table small{color:#444}
      #tab-usuarios-admin .admin-user-role{display:inline-flex;align-items:center;padding:5px 9px;border:2px solid #111;background:#fff;color:#111;border-radius:5px;font-size:.72rem;font-weight:900;white-space:nowrap}
      #tab-usuarios-admin .admin-user-status{display:inline-flex;align-items:center;padding:5px 9px;border-radius:5px;font-size:.72rem;font-weight:900;border:2px solid #111}
      #tab-usuarios-admin .admin-user-status.active{background:#eaf8ee;color:#155f2d;border-color:#247543}
      #tab-usuarios-admin .admin-user-status.blocked{background:#fff0f0;color:#8a151a;border-color:#a51f25}
      #tab-usuarios-admin .admin-users-actions{display:flex;gap:7px;flex-wrap:wrap}
      #tab-usuarios-admin .admin-users-actions button{white-space:nowrap;min-height:36px;border:2px solid #111;font-weight:800}
      #tab-usuarios-admin .admin-users-actions .btn-outline{background:#fff;color:#111;border-color:#111}
      #tab-usuarios-admin .admin-users-actions .btn-outline:hover,#tab-usuarios-admin .admin-users-actions .btn-outline:focus-visible{background:#111;color:#fff;border-color:#111}
      #tab-usuarios-admin .admin-users-actions .admin-user-delete{background:#e31e24;color:#fff;border-color:#e31e24;font-weight:900}
      #tab-usuarios-admin .admin-users-actions .admin-user-delete:hover,#tab-usuarios-admin .admin-users-actions .admin-user-delete:focus-visible{background:#b9161b;border-color:#b9161b;color:#fff}
      #tab-usuarios-admin .admin-users-danger-note{margin:0 0 12px;padding:10px 12px;border:2px solid #e31e24;background:#fff4f4;color:#111}
      .admin-user-badge{display:inline-flex;align-items:center;gap:6px;margin-right:10px;padding:7px 10px;border:1px solid rgba(0,0,0,.12);border-radius:999px;font-size:.74rem;background:#fff}
      .admin-users-modal-backdrop{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.58)}
      .admin-users-modal-backdrop.open{display:flex}
      .admin-users-modal{width:min(460px,100%);background:#fff;color:#111;border:3px solid #111;box-shadow:0 24px 70px rgba(0,0,0,.35);padding:22px}
      .admin-users-modal h3{margin:0 0 10px;font-size:1.1rem}
      .admin-users-modal p{margin:0;color:#333;line-height:1.5}
      .admin-users-modal strong{color:#e31e24}
      .admin-users-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}
      .admin-users-modal-actions button{min-height:40px;padding:9px 15px;border:2px solid #111;font-weight:900;cursor:pointer}
      .admin-users-modal-cancel{background:#fff;color:#111}
      .admin-users-modal-confirm{background:#e31e24;color:#fff;border-color:#e31e24!important}
      .admin-users-modal-confirm:hover,.admin-users-modal-confirm:focus-visible{background:#b9161b}
      .admin-users-modal-close{background:#111;color:#fff}
      @media(max-width:760px){.admin-user-badge{display:none}#tab-usuarios-admin{padding:12px}#tab-usuarios-admin .admin-toolbar{padding:14px}.admin-users-modal-actions{flex-direction:column}.admin-users-modal-actions button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if ($('#admin-users-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'admin-users-modal';
    modal.className = 'admin-users-modal-backdrop';
    modal.innerHTML = `
      <div class="admin-users-modal" role="dialog" aria-modal="true" aria-labelledby="admin-users-modal-title">
        <h3 id="admin-users-modal-title">Confirmar ação</h3>
        <p id="admin-users-modal-message"></p>
        <div class="admin-users-modal-actions">
          <button type="button" class="admin-users-modal-cancel" data-modal-cancel>Cancelar</button>
          <button type="button" class="admin-users-modal-confirm" data-modal-confirm>Confirmar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', event => { if (event.target === modal) finishModal(false); });
    modal.querySelector('[data-modal-cancel]').addEventListener('click', () => finishModal(false));
    modal.querySelector('[data-modal-confirm]').addEventListener('click', () => finishModal(true));
  }

  function finishModal(value) {
    const modal = $('#admin-users-modal');
    if (modal) modal.classList.remove('open');
    if (modalResolve) { const resolve = modalResolve; modalResolve = null; resolve(value); }
  }

  function confirmAdminAction(title, message, confirmLabel = 'Confirmar', danger = true) {
    ensureModal();
    const modal = $('#admin-users-modal');
    const titleEl = $('#admin-users-modal-title');
    const messageEl = $('#admin-users-modal-message');
    const confirm = modal?.querySelector('[data-modal-confirm]');
    if (!modal || !titleEl || !messageEl || !confirm) return Promise.resolve(false);
    titleEl.textContent = title;
    messageEl.textContent = message;
    confirm.textContent = confirmLabel;
    confirm.classList.toggle('admin-users-modal-confirm', danger);
    modal.classList.add('open');
    return new Promise(resolve => { modalResolve = resolve; });
  }

  function showAdminError(title, message) {
    ensureModal();
    const modal = $('#admin-users-modal');
    const titleEl = $('#admin-users-modal-title');
    const messageEl = $('#admin-users-modal-message');
    const confirm = modal?.querySelector('[data-modal-confirm]');
    const cancel = modal?.querySelector('[data-modal-cancel]');
    if (!modal || !titleEl || !messageEl || !confirm || !cancel) return;
    titleEl.textContent = title;
    messageEl.textContent = message;
    confirm.textContent = 'Fechar';
    confirm.classList.remove('admin-users-modal-confirm');
    confirm.classList.add('admin-users-modal-close');
    cancel.style.display = 'none';
    modal.classList.add('open');
    const reset = () => { cancel.style.display = ''; confirm.classList.remove('admin-users-modal-close'); confirm.classList.add('admin-users-modal-confirm'); };
    const oldFinish = modalResolve;
    modalResolve = value => { reset(); if (oldFinish) oldFinish(value); };
    confirm.onclick = () => { reset(); modal.classList.remove('open'); modalResolve = null; };
  }

  function roleLabel(level) { return ROLE_LABELS[level] || 'Atendimento'; }

  function roleHelp() {
    return '<strong>Proprietário:</strong> acesso completo e gerenciamento de usuários. <strong>Gerente:</strong> operação da loja, sem gerenciar usuários. <strong>Atendimento:</strong> acesso focado no atendimento e pós-venda.';
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
        <p class="admin-users-danger-note"><strong>Atenção:</strong> excluir remove o usuário administrativo de forma permanente. O próprio usuário logado não pode ser excluído por aqui.</p>
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
      button.addEventListener('click', () => { const panel = $('#tab-usuarios-admin'); if (panel) panel.style.display = 'none'; });
    });

    $('#novo-admin-user').onclick = () => openEditor();
    $('#salvar-admin-user').onclick = saveUser;
    $('#cancelar-admin-user').onclick = closeEditor;
  }

  function applyRoleVisibility() {
    if (!currentAdmin) return;
    if (currentAdmin.access_level === 'atendimento') {
      ['produtos', 'cupons', 'audit'].forEach(tab => { const button = document.querySelector(`.admin-tabs [data-tab="${tab}"]`); if (button) button.style.display = 'none'; });
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
    $('#admin-user-password-help').textContent = user ? 'Preencha a senha somente se quiser redefinir o acesso deste usuário.' : 'A senha é obrigatória para criar o usuário e fica armazenada de forma protegida, nunca em texto puro.';
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
    const button = $('#salvar-admin-user');
    if (!name || !email) return showEditorError('Preencha nome e e-mail.');
    if (!editingId && password.length < 10) return showEditorError('A senha deve ter pelo menos 10 caracteres.');
    if (editingId && password && password.length < 10) return showEditorError('A nova senha deve ter pelo menos 10 caracteres.');
    const body = { name, email, access_level };
    if (password) body.password = password;
    button.disabled = true;
    const previous = button.textContent;
    button.textContent = 'Salvando...';
    try {
      const response = await api(editingId ? `/api/admin/users/${encodeURIComponent(editingId)}` : '/api/admin/users', { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      const changedOwnPassword = editingId && currentAdmin?.id === editingId && Boolean(password);
      closeEditor();
      if (changedOwnPassword || response.session_invalidated) {
        alert('A alteração foi salva. Por segurança, entre novamente com sua senha.');
        await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
        localStorage.removeItem(TOKEN_KEY);
        location.reload();
        return;
      }
      await loadUsers();
    } catch (error) { showEditorError(error.message); }
    finally { button.disabled = false; button.textContent = previous; }
  }

  async function toggleUser(user) {
    const action = user.active ? 'bloquear' : 'reativar';
    const confirmed = await confirmAdminAction(`${action === 'bloquear' ? 'Bloquear' : 'Reativar'} usuário`, `Deseja ${action} o acesso de ${user.name}?`, action === 'bloquear' ? 'Bloquear' : 'Reativar', action === 'bloquear');
    if (!confirmed) return;
    try {
      await api(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'PATCH', body: JSON.stringify({ active: !user.active }) });
      await loadUsers();
    } catch (error) { showAdminError('Não foi possível concluir', error.message); }
  }

  async function deleteUser(user) {
    if (!user || (currentAdmin && user.id === currentAdmin.id)) return;
    const confirmed = await confirmAdminAction('Excluir administrador', `Excluir permanentemente o administrador “${user.name}”? Esta ação não poderá ser desfeita.`, 'Excluir', true);
    if (!confirmed) return;
    try {
      await api(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      await loadUsers();
    } catch (error) {
      showAdminError('Não foi possível excluir', error.message);
    }
  }

  function renderUsers() {
    const host = $('#admin-users-list');
    if (!host) return;
    host.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Usuário</th><th>Nível</th><th>Status</th><th>Último acesso</th><th>Ações</th></tr></thead>
        <tbody>${users.map(user => {
          const self = currentAdmin && user.id === currentAdmin.id;
          return `<tr>
            <td><strong>${esc(user.name)}</strong>${self ? ' <small>(você)</small>' : ''}<br><small>${esc(user.email)}</small></td>
            <td><span class="admin-user-role">${esc(roleLabel(user.access_level))}</span></td>
            <td><span class="admin-user-status ${user.active ? 'active' : 'blocked'}">${user.active ? 'Ativo' : 'Bloqueado'}</span></td>
            <td>${esc(date(user.last_login_at))}</td>
            <td><div class="admin-users-actions">
              <button type="button" class="btn btn-outline" data-admin-user-edit="${esc(user.id)}">Editar</button>
              ${self ? '' : `<button type="button" class="btn btn-outline" data-admin-user-toggle="${esc(user.id)}">${user.active ? 'Bloquear' : 'Reativar'}</button><button type="button" class="btn admin-user-delete" data-admin-user-delete="${esc(user.id)}">Excluir</button>`}
            </div></td>
          </tr>`;
        }).join('') || '<tr><td colspan="5">Nenhum usuário administrativo cadastrado.</td></tr>'}</tbody>
      </table>`;

    host.querySelectorAll('[data-admin-user-edit]').forEach(button => { button.onclick = () => openEditor(users.find(user => user.id === button.dataset.adminUserEdit)); });
    host.querySelectorAll('[data-admin-user-toggle]').forEach(button => { button.onclick = () => { const user = users.find(item => item.id === button.dataset.adminUserToggle); if (user) toggleUser(user); }; });
    host.querySelectorAll('[data-admin-user-delete]').forEach(button => { button.onclick = () => { const user = users.find(item => item.id === button.dataset.adminUserDelete); if (user) deleteUser(user); }; });
  }

  async function loadUsers() {
    const host = $('#admin-users-list');
    if (!host) return;
    host.innerHTML = '<p class="admin-muted">Carregando usuários...</p>';
    try { users = await api('/api/admin/users'); renderUsers(); }
    catch (error) { host.innerHTML = `<div class="form-error">${esc(error.message)}</div>`; }
  }

  async function syncIdentity() {
    try {
      const session = await api('/api/admin/session');
      if (!session.authenticated || !session.admin) return;
      currentAdmin = session.admin;
      const loginCopy = document.querySelector('#login-screen .admin-muted');
      if (loginCopy) loginCopy.textContent = 'Entre com seu usuário administrativo.';
      ensureBadge();
      ensureUi();
      applyRoleVisibility();
    } catch {}
  }

  document.addEventListener('DOMContentLoaded', () => {
    addStyles();
    ensureModal();
    syncIdentity();
    const loginButton = $('#login-btn');
    if (loginButton) loginButton.addEventListener('click', () => setTimeout(syncIdentity, 350));
  });
})();
