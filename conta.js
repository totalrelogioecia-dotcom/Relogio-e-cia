/* =========================================================
   RELÓGIO E CIA — conta do cliente no servidor
   Cadastro, login, endereço por CEP e redefinição de senha
   ========================================================= */
(function () {
  const TOKEN_KEY = 'reloja_auth_token';
  const SESSION_KEY = 'reloja_sessao';
  const LEGACY_USERS_KEY = 'reloja_usuarios';

  const digits = v => String(v || '').replace(/\D/g, '');
  const escapeHtml = v => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  function formatCep(v) {
    const n = digits(v).slice(0, 8);
    return n.length > 5 ? `${n.slice(0, 5)}-${n.slice(5)}` : n;
  }
  function formatCpf(v) {
    const n = digits(v).slice(0, 11);
    if (n.length <= 3) return n;
    if (n.length <= 6) return `${n.slice(0, 3)}.${n.slice(3)}`;
    if (n.length <= 9) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`;
    return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
  }
  function formatPhone(v) {
    const n = digits(v).slice(0, 11);
    if (n.length <= 2) return n;
    if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
    return n.length === 11
      ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
      : `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  }

  async function api(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data.error || 'Não foi possível concluir a operação.');
      err.status = response.status;
      throw err;
    }
    return data;
  }

  function saveSession(token, user) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    if (typeof atualizarLinkConta === 'function') atualizarLinkConta();
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
    if (typeof atualizarLinkConta === 'function') atualizarLinkConta();
  }

  function getBox() { return document.getElementById('account-box'); }

  async function buscarCep() {
    const input = document.getElementById('cad-cep');
    const status = document.getElementById('cep-status');
    if (!input) return;
    const cep = digits(input.value).slice(0, 8);
    if (cep.length !== 8) {
      if (status) status.textContent = 'Digite um CEP com 8 números.';
      return;
    }
    if (status) status.textContent = 'Buscando endereço…';
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Falha na consulta do CEP.');
      const d = await response.json();
      if (d.erro) throw new Error('CEP não encontrado.');
      document.getElementById('cad-rua').value = d.logradouro || '';
      document.getElementById('cad-bairro').value = d.bairro || '';
      document.getElementById('cad-cidade').value = d.localidade || '';
      document.getElementById('cad-estado').value = d.uf || '';
      if (status) status.textContent = 'Endereço encontrado automaticamente.';
      document.getElementById('cad-numero')?.focus();
    } catch (e) {
      if (status) status.textContent = e.message || 'Não foi possível consultar o CEP.';
    }
  }

  function renderLogado(user) {
    const box = getBox();
    const e = user.endereco || {};
    const endereco = e.street_name
      ? `${escapeHtml(e.street_name)}, ${escapeHtml(e.street_number)}${e.complement ? ` — ${escapeHtml(e.complement)}` : ''}<br>${escapeHtml(e.neighborhood)} — ${escapeHtml(e.city_name)}/${escapeHtml(e.state_code || e.state_name)}<br>CEP ${formatCep(e.zip_code)}`
      : 'Endereço não cadastrado.';

    box.innerHTML = `
      <div class="account-profile">
        <p>Você está conectado como</p>
        <p><strong>${escapeHtml(user.nome)}</strong></p>
        <p>${escapeHtml(user.email)}</p>
        ${user.telefone?.number ? `<p>Telefone: ${escapeHtml(formatPhone((user.telefone.area_code || '') + user.telefone.number))}</p>` : ''}
        ${user.identificacao?.number ? `<p>CPF: ${escapeHtml(formatCpf(user.identificacao.number))}</p>` : '<p>CPF: não informado</p>'}
        <div style="margin-top:18px;padding-top:16px;border-top:1px solid rgba(0,0,0,.12);">
          <strong>Endereço de entrega</strong>
          <p style="margin-top:6px;line-height:1.6;">${endereco}</p>
        </div>
      </div>
      <button class="btn btn-outline" id="btn-sair" style="width:100%;justify-content:center;margin-top:10px;">Sair da conta</button>
      <a class="btn btn-primary" href="carrinho.html" style="width:100%;justify-content:center;margin-top:10px;">Ir para o carrinho</a>
    `;
    document.getElementById('btn-sair').addEventListener('click', () => {
      clearSession();
      renderDeslogado();
    });
  }

  function renderReset(token) {
    const box = getBox();
    box.innerHTML = `
      <p class="eyebrow">Recuperar acesso</p>
      <h2 style="font-family:var(--font-display);font-size:1.5rem;margin:0 0 12px;">Criar nova senha</h2>
      <p class="form-note">Digite uma nova senha com pelo menos 8 caracteres.</p>
      <p class="form-error" id="reset-error" style="display:none;"></p>
      <div class="form-field"><label for="reset-password">Nova senha</label><input type="password" id="reset-password" minlength="8" autocomplete="new-password"></div>
      <div class="form-field"><label for="reset-confirm">Confirmar nova senha</label><input type="password" id="reset-confirm" minlength="8" autocomplete="new-password"></div>
      <button class="btn btn-primary" id="btn-reset" style="width:100%;justify-content:center;">Salvar nova senha</button>
    `;
    document.getElementById('btn-reset').addEventListener('click', async () => {
      const error = document.getElementById('reset-error');
      const senha = document.getElementById('reset-password').value;
      const confirm = document.getElementById('reset-confirm').value;
      if (senha.length < 8) {
        error.textContent = 'A senha deve ter pelo menos 8 caracteres.';
        error.style.display = 'block';
        return;
      }
      if (senha !== confirm) {
        error.textContent = 'As senhas não coincidem.';
        error.style.display = 'block';
        return;
      }
      try {
        const data = await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, senha }) });
        saveSession(data.token, data.user);
        history.replaceState({}, '', location.pathname);
        renderLogado(data.user);
      } catch (e) {
        error.textContent = e.message;
        error.style.display = 'block';
      }
    });
  }

  function renderDeslogado() {
    const box = getBox();
    box.innerHTML = `
      <div class="account-tabs">
        <button type="button" class="active" data-tab="login">Entrar</button>
        <button type="button" data-tab="cadastro">Criar conta</button>
      </div>
      <div id="tab-login">
        <p class="form-error" id="erro-login" style="display:none;"></p>
        <div class="form-field"><label for="login-email">E-mail</label><input type="email" id="login-email" autocomplete="email"></div>
        <div class="form-field"><label for="login-senha">Senha</label><input type="password" id="login-senha" autocomplete="current-password"></div>
        <button class="btn btn-primary" type="button" id="btn-login" style="width:100%;justify-content:center;">Entrar</button>
      </div>
      <div id="tab-cadastro" style="display:none;">
        <p class="form-error" id="erro-cadastro" style="display:none;"></p>
        <p class="eyebrow" style="margin-top:24px;">Dados pessoais</p>
        <div class="form-field"><label for="cad-nome">Nome completo</label><input type="text" id="cad-nome" autocomplete="name"></div>
        <div class="form-field"><label for="cad-email">E-mail</label><input type="email" id="cad-email" autocomplete="email"></div>
        <div class="form-field"><label for="cad-telefone">Telefone</label><input type="tel" id="cad-telefone" placeholder="(51) 99999-9999" autocomplete="tel"></div>
        <div class="form-field"><label for="cad-cpf">CPF <span style="font-weight:400;opacity:.65;">(opcional)</span></label><input type="text" id="cad-cpf" inputmode="numeric" placeholder="000.000.000-00"></div>
        <div class="form-field"><label for="cad-senha">Senha</label><input type="password" id="cad-senha" minlength="8" autocomplete="new-password"><small>Use pelo menos 8 caracteres.</small></div>
        <p class="eyebrow" style="margin-top:28px;">Endereço de entrega</p>
        <p class="form-note">Seu endereço fica salvo para futuras compras, cálculo de frete e entrega.</p>
        <div class="form-field"><label for="cad-cep">CEP</label><input type="text" id="cad-cep" inputmode="numeric" placeholder="00000-000" autocomplete="postal-code"><small id="cep-status"></small></div>
        <div class="form-field"><label for="cad-rua">Rua</label><input type="text" id="cad-rua" autocomplete="street-address"></div>
        <div class="form-field"><label for="cad-numero">Número</label><input type="text" id="cad-numero"></div>
        <div class="form-field"><label for="cad-complemento">Complemento <span style="font-weight:400;opacity:.65;">(opcional)</span></label><input type="text" id="cad-complemento"></div>
        <div class="form-field"><label for="cad-bairro">Bairro</label><input type="text" id="cad-bairro"></div>
        <div class="form-field"><label for="cad-cidade">Cidade</label><input type="text" id="cad-cidade"></div>
        <div class="form-field"><label for="cad-estado">Estado (UF)</label><input type="text" id="cad-estado" maxlength="2"></div>
        <button class="btn btn-primary" type="button" id="btn-cadastro" style="width:100%;justify-content:center;">Criar conta</button>
      </div>
    `;

    const tabs = box.querySelectorAll('.account-tabs button');
    tabs.forEach(t => t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('tab-login').style.display = t.dataset.tab === 'login' ? 'block' : 'none';
      document.getElementById('tab-cadastro').style.display = t.dataset.tab === 'cadastro' ? 'block' : 'none';
    }));

    document.getElementById('btn-login').addEventListener('click', async () => {
      const error = document.getElementById('erro-login');
      const email = document.getElementById('login-email').value.trim().toLowerCase();
      const senha = document.getElementById('login-senha').value;
      try {
        const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
        saveSession(data.token, data.user);
        renderLogado(data.user);
      } catch (e) {
        error.textContent = e.message;
        error.style.display = 'block';
      }
    });

    const phone = document.getElementById('cad-telefone');
    const cpf = document.getElementById('cad-cpf');
    const cep = document.getElementById('cad-cep');
    const uf = document.getElementById('cad-estado');
    phone.addEventListener('input', () => { phone.value = formatPhone(phone.value); });
    cpf.addEventListener('input', () => { cpf.value = formatCpf(cpf.value); });
    cep.addEventListener('input', () => {
      cep.value = formatCep(cep.value);
      if (digits(cep.value).length === 8) buscarCep();
    });
    cep.addEventListener('blur', buscarCep);
    uf.addEventListener('input', () => { uf.value = uf.value.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase(); });

    document.getElementById('btn-cadastro').addEventListener('click', async () => {
      const error = document.getElementById('erro-cadastro');
      const nome = document.getElementById('cad-nome').value.trim();
      const email = document.getElementById('cad-email').value.trim().toLowerCase();
      const senha = document.getElementById('cad-senha').value;
      const telefone = digits(phone.value).slice(0, 11);
      const cpfN = digits(cpf.value).slice(0, 11);
      const endereco = {
        zip_code: digits(cep.value).slice(0, 8),
        street_name: document.getElementById('cad-rua').value.trim(),
        street_number: document.getElementById('cad-numero').value.trim(),
        complement: document.getElementById('cad-complemento').value.trim(),
        neighborhood: document.getElementById('cad-bairro').value.trim(),
        city_name: document.getElementById('cad-cidade').value.trim(),
        state_name: uf.value,
        state_code: uf.value
      };

      if (!nome || !email || senha.length < 8 || telefone.length < 10 || endereco.zip_code.length !== 8 || !endereco.street_name || !endereco.street_number || !endereco.neighborhood || !endereco.city_name || endereco.state_code.length !== 2) {
        error.textContent = 'Preencha todos os campos obrigatórios. A senha deve ter pelo menos 8 caracteres.';
        error.style.display = 'block';
        return;
      }
      if (cpfN && cpfN.length !== 11) {
        error.textContent = 'Se informar o CPF, digite os 11 números.';
        error.style.display = 'block';
        return;
      }

      try {
        const body = {
          nome, email, senha,
          telefone: { area_code: telefone.slice(0, 2), number: telefone.slice(2) },
          identificacao: cpfN ? { type: 'CPF', number: cpfN } : null,
          endereco
        };
        const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
        saveSession(data.token, data.user);
        localStorage.removeItem(LEGACY_USERS_KEY);
        renderLogado(data.user);
      } catch (e) {
        error.textContent = e.message;
        error.style.display = 'block';
      }
    });
  }

  async function migrarContaAntiga() {
    let legacy;
    try { legacy = JSON.parse(localStorage.getItem(LEGACY_USERS_KEY) || '[]'); }
    catch { legacy = []; }
    if (!Array.isArray(legacy) || !legacy.length) return;

    for (const old of legacy) {
      try {
        const senha = String(old.senha || '');
        if (senha.length < 8 || !old.email || !old.nome || !old.telefone?.number || !old.endereco?.zip_code) continue;
        await api('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            nome: old.nome,
            email: old.email,
            senha,
            telefone: old.telefone,
            identificacao: old.identificacao || null,
            endereco: old.endereco
          })
        });
      } catch (e) {
        if (e.status !== 409) console.warn('Não foi possível migrar uma conta antiga:', old.email, e.message);
      }
    }
  }

  async function iniciar() {
    const box = getBox();
    if (!box) return;

    const resetToken = new URLSearchParams(location.search).get('reset_token');
    if (resetToken) {
      renderReset(resetToken);
      return;
    }

    await migrarContaAntiga();

    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      try {
        const data = await api('/api/auth/me');
        saveSession(token, data.user);
        renderLogado(data.user);
        return;
      } catch {
        clearSession();
      }
    }

    renderDeslogado();
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
