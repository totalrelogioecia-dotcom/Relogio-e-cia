/* =========================================================
   RELÓGIO E CIA — dados adicionais da conta
   CPF opcional + telefone + endereço + busca automática por CEP
   ========================================================= */
(function () {
  const CHAVE_USUARIOS = 'reloja_usuarios';
  const CHAVE_SESSAO = 'reloja_sessao';

  function obterUsuariosLocal() {
    try { return JSON.parse(localStorage.getItem(CHAVE_USUARIOS)) || []; }
    catch { return []; }
  }

  function salvarUsuariosLocal(usuarios) {
    localStorage.setItem(CHAVE_USUARIOS, JSON.stringify(usuarios));
  }

  function atualizarSessaoLocal(usuario) {
    const sessao = {
      nome: usuario.nome,
      email: usuario.email,
      telefone: usuario.telefone || null,
      identificacao: usuario.identificacao || null,
      endereco: usuario.endereco || null
    };
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
    if (typeof atualizarLinkConta === 'function') atualizarLinkConta();
  }

  function normalizarTelefone(valor) {
    return String(valor || '').replace(/\D/g, '').slice(0, 11);
  }

  function normalizarCep(valor) {
    return String(valor || '').replace(/\D/g, '').slice(0, 8);
  }

  function normalizarCpf(valor) {
    return String(valor || '').replace(/\D/g, '').slice(0, 11);
  }

  function formatarCep(valor) {
    const n = normalizarCep(valor);
    return n.length > 5 ? `${n.slice(0, 5)}-${n.slice(5)}` : n;
  }

  function formatarCpf(valor) {
    const n = normalizarCpf(valor);
    if (n.length <= 3) return n;
    if (n.length <= 6) return `${n.slice(0, 3)}.${n.slice(3)}`;
    if (n.length <= 9) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`;
    return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
  }

  function formatarTelefone(valor) {
    const n = normalizarTelefone(valor);
    if (n.length <= 2) return n;
    if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
    return n.length === 11
      ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
      : `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  }

  function escaparHtml(valor) {
    return String(valor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function buscarCep() {
    const cepInput = document.getElementById('cad-cep');
    const status = document.getElementById('cep-status');
    if (!cepInput) return;

    const cep = normalizarCep(cepInput.value);
    if (cep.length !== 8) {
      if (status) status.textContent = 'Digite um CEP com 8 números.';
      return;
    }

    if (status) status.textContent = 'Buscando endereço…';
    const campos = ['cad-rua', 'cad-bairro', 'cad-cidade', 'cad-estado'];
    campos.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = true;
    });

    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        headers: { Accept: 'application/json' }
      });
      if (!resposta.ok) throw new Error('Falha na consulta do CEP.');
      const dados = await resposta.json();
      if (dados.erro) throw new Error('CEP não encontrado.');

      const valores = {
        'cad-rua': dados.logradouro || '',
        'cad-bairro': dados.bairro || '',
        'cad-cidade': dados.localidade || '',
        'cad-estado': dados.uf || ''
      };
      Object.entries(valores).forEach(([id, valor]) => {
        const el = document.getElementById(id);
        if (el) el.value = valor;
      });
      if (status) status.textContent = 'Endereço encontrado automaticamente.';
      const numero = document.getElementById('cad-numero');
      if (numero) numero.focus();
    } catch (erro) {
      if (status) status.textContent = erro.message || 'Não foi possível consultar o CEP.';
    } finally {
      campos.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
      });
    }
  }

  function dadosCadastro() {
    const nome = document.getElementById('cad-nome')?.value.trim() || '';
    const email = document.getElementById('cad-email')?.value.trim().toLowerCase() || '';
    const senha = document.getElementById('cad-senha')?.value || '';
    const cpf = normalizarCpf(document.getElementById('cad-cpf')?.value);
    const telefone = normalizarTelefone(document.getElementById('cad-telefone')?.value);
    const cep = normalizarCep(document.getElementById('cad-cep')?.value);
    const rua = document.getElementById('cad-rua')?.value.trim() || '';
    const numero = document.getElementById('cad-numero')?.value.trim() || '';
    const complemento = document.getElementById('cad-complemento')?.value.trim() || '';
    const bairro = document.getElementById('cad-bairro')?.value.trim() || '';
    const cidade = document.getElementById('cad-cidade')?.value.trim() || '';
    const estado = document.getElementById('cad-estado')?.value.trim().toUpperCase() || '';

    return {
      nome, email, senha, cpf, telefone,
      endereco: { cep, rua, numero, complemento, bairro, cidade, estado }
    };
  }

  function validarCadastro(dados) {
    if (!dados.nome || !dados.email || dados.senha.length < 4) {
      return 'Preencha nome, e-mail e uma senha com pelo menos 4 caracteres.';
    }
    if (dados.telefone.length < 10) return 'Informe um telefone válido com DDD.';
    if (dados.endereco.cep.length !== 8) return 'Informe um CEP válido.';
    if (!dados.endereco.rua || !dados.endereco.numero || !dados.endereco.bairro || !dados.endereco.cidade || !dados.endereco.estado) {
      return 'Preencha o endereço completo. O complemento é opcional.';
    }
    if (dados.cpf && dados.cpf.length !== 11) return 'Se informar o CPF, digite os 11 números.';
    return null;
  }

  function montarContaUsuario(dados) {
    const usuario = {
      nome: dados.nome,
      email: dados.email,
      senha: dados.senha,
      telefone: {
        area_code: dados.telefone.slice(0, 2),
        number: dados.telefone.slice(2)
      },
      endereco: {
        zip_code: dados.endereco.cep,
        street_name: dados.endereco.rua,
        street_number: dados.endereco.numero,
        complement: dados.endereco.complemento,
        neighborhood: dados.endereco.bairro,
        city_name: dados.endereco.cidade,
        state_name: dados.endereco.estado,
        state_code: dados.endereco.estado,
        country_name: 'Brasil'
      }
    };

    if (dados.cpf) {
      usuario.identificacao = { type: 'CPF', number: dados.cpf };
    }

    return usuario;
  }

  function iniciarContaAtualizada() {
    const box = document.getElementById('account-box');
    if (!box) return;

    function sessaoLocal() {
      try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO)); }
      catch { return null; }
    }

    function renderLogado(sessao) {
      const endereco = sessao.endereco || {};
      const enderecoTexto = endereco.rua
        ? `${endereco.rua}, ${endereco.numero}${endereco.complemento ? ` — ${endereco.complemento}` : ''}<br>${endereco.bairro} — ${endereco.cidade}/${endereco.estado}<br>CEP ${formatarCep(endereco.cep || endereco.zip_code)}`
        : 'Endereço não cadastrado.';

      box.innerHTML = `
        <div class="account-profile">
          <p>Você está conectado como</p>
          <p><strong>${escaparHtml(sessao.nome)}</strong></p>
          <p>${escaparHtml(sessao.email)}</p>
          ${sessao.telefone?.number ? `<p>Telefone: ${escaparHtml(formatarTelefone((sessao.telefone.area_code || '') + sessao.telefone.number))}</p>` : ''}
          ${sessao.identificacao?.number ? `<p>CPF: ${escaparHtml(formatarCpf(sessao.identificacao.number))}</p>` : '<p>CPF: não informado</p>'}
          <div style="margin-top:18px; padding-top:16px; border-top:1px solid rgba(0,0,0,.12);">
            <strong>Endereço de entrega</strong>
            <p style="margin-top:6px; line-height:1.6;">${enderecoTexto}</p>
          </div>
        </div>
        <button class="btn btn-outline" style="width:100%; justify-content:center; margin-top:10px;" id="btn-sair">Sair da conta</button>
        <a class="btn btn-primary" style="width:100%; justify-content:center; margin-top:10px;" href="carrinho.html">Ir para o carrinho</a>
      `;
      document.getElementById('btn-sair').addEventListener('click', () => {
        localStorage.removeItem(CHAVE_SESSAO);
        if (typeof atualizarLinkConta === 'function') atualizarLinkConta();
        renderDeslogado();
      });
    }

    function renderDeslogado() {
      box.innerHTML = `
        <div class="account-tabs">
          <button type="button" class="active" data-tab="login">Entrar</button>
          <button type="button" data-tab="cadastro">Criar conta</button>
        </div>
        <div id="tab-login">
          <p class="form-error" id="erro-login" style="display:none;"></p>
          <div class="form-field"><label for="login-email">E-mail</label><input type="email" id="login-email" autocomplete="email" required></div>
          <div class="form-field"><label for="login-senha">Senha</label><input type="password" id="login-senha" autocomplete="current-password" required></div>
          <button class="btn btn-primary" type="button" id="btn-login" style="width:100%; justify-content:center;">Entrar</button>
        </div>
        <div id="tab-cadastro" style="display:none;">
          <p class="form-error" id="erro-cadastro" style="display:none;"></p>

          <p class="eyebrow" style="margin-top:24px;">Dados pessoais</p>
          <div class="form-field"><label for="cad-nome">Nome completo</label><input type="text" id="cad-nome" autocomplete="name" required></div>
          <div class="form-field"><label for="cad-email">E-mail</label><input type="email" id="cad-email" autocomplete="email" required></div>
          <div class="form-field"><label for="cad-telefone">Telefone</label><input type="tel" id="cad-telefone" inputmode="tel" autocomplete="tel" placeholder="(51) 99999-9999" required></div>
          <div class="form-field"><label for="cad-cpf">CPF <span style="font-weight:400; opacity:.65;">(opcional)</span></label><input type="text" id="cad-cpf" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00"></div>
          <div class="form-field"><label for="cad-senha">Senha</label><input type="password" id="cad-senha" autocomplete="new-password" minlength="4" required></div>

          <p class="eyebrow" style="margin-top:28px;">Endereço de entrega</p>
          <p class="form-note">Seu endereço fica salvo na conta para facilitar futuras compras e será usado posteriormente para cálculo de frete e entrega.</p>
          <div class="form-field"><label for="cad-cep">CEP</label><input type="text" id="cad-cep" inputmode="numeric" autocomplete="postal-code" placeholder="00000-000" required><small id="cep-status" style="display:block; margin-top:6px; color:var(--ink-soft);"></small></div>
          <div class="form-field"><label for="cad-rua">Rua</label><input type="text" id="cad-rua" autocomplete="street-address" required></div>
          <div class="form-field"><label for="cad-numero">Número</label><input type="text" id="cad-numero" inputmode="numeric" autocomplete="address-line2" required></div>
          <div class="form-field"><label for="cad-complemento">Complemento <span style="font-weight:400; opacity:.65;">(opcional)</span></label><input type="text" id="cad-complemento" autocomplete="address-line2"></div>
          <div class="form-field"><label for="cad-bairro">Bairro</label><input type="text" id="cad-bairro" autocomplete="address-level3" required></div>
          <div class="form-field"><label for="cad-cidade">Cidade</label><input type="text" id="cad-cidade" autocomplete="address-level2" required></div>
          <div class="form-field"><label for="cad-estado">Estado (UF)</label><input type="text" id="cad-estado" maxlength="2" autocomplete="address-level1" required></div>

          <p class="form-note">A busca automática usa o serviço ViaCEP. Confira os dados encontrados antes de criar a conta.</p>
          <button class="btn btn-primary" type="button" id="btn-cadastro" style="width:100%; justify-content:center;">Criar conta</button>
        </div>
      `;

      const tabs = box.querySelectorAll('.account-tabs button');
      tabs.forEach(t => t.addEventListener('click', () => {
        tabs.forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        document.getElementById('tab-login').style.display = t.dataset.tab === 'login' ? 'block' : 'none';
        document.getElementById('tab-cadastro').style.display = t.dataset.tab === 'cadastro' ? 'block' : 'none';
      }));

      const telefone = document.getElementById('cad-telefone');
      const cpf = document.getElementById('cad-cpf');
      const cep = document.getElementById('cad-cep');
      const estado = document.getElementById('cad-estado');

      telefone.addEventListener('input', () => { telefone.value = formatarTelefone(telefone.value); });
      cpf.addEventListener('input', () => { cpf.value = formatarCpf(cpf.value); });
      cep.addEventListener('input', () => {
        cep.value = formatarCep(cep.value);
        if (normalizarCep(cep.value).length === 8) buscarCep();
      });
      cep.addEventListener('blur', buscarCep);
      estado.addEventListener('input', () => { estado.value = estado.value.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase(); });

      document.getElementById('btn-login').addEventListener('click', () => {
        const email = document.getElementById('login-email').value.trim().toLowerCase();
        const senha = document.getElementById('login-senha').value;
        const erro = document.getElementById('erro-login');
        const usuario = obterUsuariosLocal().find(u => u.email === email && u.senha === senha);
        if (!usuario) {
          erro.textContent = 'E-mail ou senha incorretos.';
          erro.style.display = 'block';
          return;
        }
        atualizarSessaoLocal(usuario);
        renderLogado(sessaoLocal());
      });

      document.getElementById('btn-cadastro').addEventListener('click', () => {
        const dados = dadosCadastro();
        const erro = document.getElementById('erro-cadastro');
        const validacao = validarCadastro(dados);
        if (validacao) {
          erro.textContent = validacao;
          erro.style.display = 'block';
          return;
        }

        const usuarios = obterUsuariosLocal();
        if (usuarios.some(u => u.email === dados.email)) {
          erro.textContent = 'Já existe uma conta com esse e-mail.';
          erro.style.display = 'block';
          return;
        }

        const usuario = montarContaUsuario(dados);
        usuarios.push(usuario);
        salvarUsuariosLocal(usuarios);
        atualizarSessaoLocal(usuario);
        renderLogado(sessaoLocal());
      });
    }

    const sessao = sessaoLocal();
    if (sessao) renderLogado(sessao); else renderDeslogado();
  }

  window.iniciarPaginaConta = iniciarContaAtualizada;
  window.cadastrarUsuario = function (nome, email, senha) {
    const usuarios = obterUsuariosLocal();
    const emailNorm = String(email || '').trim().toLowerCase();
    if (usuarios.some(u => u.email === emailNorm)) return { ok: false, msg: 'Já existe uma conta com esse e-mail.' };
    const usuario = { nome: String(nome || '').trim(), email: emailNorm, senha: String(senha || '') };
    usuarios.push(usuario);
    salvarUsuariosLocal(usuarios);
    atualizarSessaoLocal(usuario);
    return { ok: true };
  };

  document.addEventListener('DOMContentLoaded', iniciarContaAtualizada);
})();
