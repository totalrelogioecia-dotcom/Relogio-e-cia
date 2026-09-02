/* =========================================================
   RELÓGIO E CIA — script.js (v2)
   ========================================================= */

/* =========================================================
   CONTA E CARRINHO (armazenamento local do navegador)
   O catálogo é carregado do backend; carrinho e sessão do cliente ficam no navegador.
   ========================================================= */
const CHAVE_CARRINHO = 'reloja_carrinho';
const CHAVE_USUARIOS = 'reloja_usuarios';
const CHAVE_SESSAO = 'reloja_sessao';
const CHAVE_CONTRASTE = 'reloja_high_contrast';
const CHAVE_TEXTO_MAIOR = 'reloja_large_text';
const CHAVE_MODO_ESCURO = 'reloja_dark_mode';

function obterCarrinho() {
  try { return JSON.parse(localStorage.getItem(CHAVE_CARRINHO)) || []; }
  catch { return []; }
}
function salvarCarrinho(itens) {
  localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(itens));
  atualizarBadgeCarrinho();
}
function adicionarAoCarrinho(id, qtd = 1) {
  const produto = PRODUTOS.find(p => p.id === id);
  if (!produto) return;
  const itens = obterCarrinho();
  const existente = itens.find(i => i.id === id);
  if (existente) existente.qtd += qtd;
  else itens.push({
    id: produto.id, sku: produto.sku, nome: produto.nome,
    preco: produto.preco, marca: produto.marca,
    foto: (produto.fotos && produto.fotos[0]) || produto.foto || '',
    qtd
  });
  salvarCarrinho(itens);
}
function removerDoCarrinho(id) {
  salvarCarrinho(obterCarrinho().filter(i => i.id !== id));
}
function alterarQtdCarrinho(id, qtd) {
  const itens = obterCarrinho();
  const item = itens.find(i => i.id === id);
  if (!item) return;
  item.qtd = Math.max(1, qtd);
  salvarCarrinho(itens);
}
function totalItensCarrinho() {
  return obterCarrinho().reduce((s, i) => s + i.qtd, 0);
}
function totalCarrinho() {
  return obterCarrinho().reduce((s, i) => s + i.qtd * i.preco, 0);
}
function atualizarBadgeCarrinho() {
  document.querySelectorAll('.cart-badge').forEach(b => {
    const n = totalItensCarrinho();
    b.textContent = n;
    b.dataset.zero = n === 0 ? '1' : '0';
  });
}

/* ---------- Contas de usuário (simuladas, sem backend) ---------- */
function obterUsuarios() {
  try { return JSON.parse(localStorage.getItem(CHAVE_USUARIOS)) || []; }
  catch { return []; }
}
function cadastrarUsuario(nome, email, senha) {
  const usuarios = obterUsuarios();
  const emailNorm = email.trim().toLowerCase();
  if (usuarios.some(u => u.email === emailNorm)) {
    return { ok: false, msg: 'Já existe uma conta com esse e-mail.' };
  }
  usuarios.push({ nome: nome.trim(), email: emailNorm, senha });
  localStorage.setItem(CHAVE_USUARIOS, JSON.stringify(usuarios));
  iniciarSessao({ nome: nome.trim(), email: emailNorm });
  return { ok: true };
}
function autenticarUsuario(email, senha) {
  const emailNorm = email.trim().toLowerCase();
  const usuario = obterUsuarios().find(u => u.email === emailNorm && u.senha === senha);
  if (!usuario) return { ok: false, msg: 'E-mail ou senha incorretos.' };
  iniciarSessao({ nome: usuario.nome, email: usuario.email });
  return { ok: true };
}
function iniciarSessao(usuario) {
  localStorage.setItem(CHAVE_SESSAO, JSON.stringify(usuario));
  atualizarLinkConta();
}
function sessaoAtual() {
  try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO)); }
  catch { return null; }
}
function encerrarSessao() {
  localStorage.removeItem(CHAVE_SESSAO);
  atualizarLinkConta();
}
function atualizarLinkConta() {
  const link = document.getElementById('nav-conta-link');
  if (!link) return;
  const sessao = sessaoAtual();
  link.textContent = sessao ? sessao.nome.split(' ')[0] : 'Conta';
}

document.addEventListener('DOMContentLoaded', () => {
  atualizarBadgeCarrinho();
  atualizarLinkConta();
});

/* ---------- Menu mobile ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  const utility = document.querySelector('.nav-utility');
  const catalog = document.querySelector('.nav-cta');
  if (!toggle || !links) return;

  if (!links.querySelector('.nav-mobile-account')) {
    const accountHref = utility?.querySelector('#nav-conta-link')?.getAttribute('href') || 'conta.html';
    const cartHref = utility?.querySelector('a[href*="carrinho"]')?.getAttribute('href') || 'carrinho.html';

    links.insertAdjacentHTML('beforeend', `
      <li class="nav-mobile-only nav-mobile-account"><a href="${accountHref}">Minha conta</a></li>
      <li class="nav-mobile-only"><a href="${cartHref}">Carrinho <span class="cart-badge" data-zero="1">0</span></a></li>
      <li class="nav-mobile-only"><a href="${catalog?.getAttribute('href') || 'produtos.html'}">Ver catálogo</a></li>
    `);
    atualizarBadgeCarrinho();
  }

  toggle.textContent = 'Mais';
  toggle.setAttribute('aria-label', 'Abrir mais opções');
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.textContent = open ? 'Fechar' : 'Mais';
    toggle.setAttribute('aria-label', open ? 'Fechar mais opções' : 'Abrir mais opções');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  links.addEventListener('click', event => {
    if (!event.target.closest('a')) return;
    links.classList.remove('open');
    toggle.textContent = 'Mais';
    toggle.setAttribute('aria-expanded', 'false');
  });
});

/* ---------- Acessibilidade e conforto visual ---------- */
function lerPreferenciaBooleana(chave) {
  try { return localStorage.getItem(chave) === '1'; }
  catch { return false; }
}

function salvarPreferenciaBooleana(chave, valor) {
  try { localStorage.setItem(chave, valor ? '1' : '0'); }
  catch (_) {}
}

if (lerPreferenciaBooleana(CHAVE_CONTRASTE)) document.documentElement.classList.add('reloja-high-contrast');
if (lerPreferenciaBooleana(CHAVE_TEXTO_MAIOR)) document.documentElement.classList.add('reloja-large-text');
if (lerPreferenciaBooleana(CHAVE_MODO_ESCURO) && !document.documentElement.classList.contains('reloja-high-contrast')) {
  document.documentElement.classList.add('reloja-dark');
}

function garantirEstilosAcessibilidade() {
  if (document.getElementById('reloja-accessibility-controls-style')) return;
  const style = document.createElement('style');
  style.id = 'reloja-accessibility-controls-style';
  style.textContent = `
    .reloja-accessibility-controls{display:flex;align-items:center;gap:5px;z-index:6}
    .reloja-accessibility-button{appearance:none;width:30px;height:30px;padding:0;border:1px solid var(--line-strong);background:var(--bg);color:var(--ink);display:inline-flex;align-items:center;justify-content:center;font:700 .66rem/1 var(--font-mono);letter-spacing:-.02em;cursor:pointer;transition:background .16s,color .16s,border-color .16s,transform .16s}
    .reloja-accessibility-button:hover{border-color:var(--red);color:var(--red);transform:translateY(-1px)}
    .reloja-accessibility-button[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
    .reloja-accessibility-button:focus-visible{outline:3px solid var(--red);outline-offset:2px}
    .reloja-accessibility-rail{position:absolute;top:48px;left:50%;transform:translateX(-50%);flex-direction:column}
    .reloja-accessibility-header{margin-left:8px;margin-right:10px;flex-shrink:0}
    html.reloja-large-text{font-size:112.5%}
    html.reloja-dark{color-scheme:dark;--bg:#111214;--bg-soft:#1A1C20;--bg-black:#050506;--bg-black-2:#0B0C0E;--ink:#F5F5F2;--ink-soft:#D7D9DE;--muted:#A7AAB1;--paper:#17191C;--line:rgba(255,255,255,.16);--line-strong:rgba(255,255,255,.42);--line-inverse:rgba(255,255,255,.25)}
    html.reloja-dark body,html.reloja-dark .site-header{background:var(--bg);color:var(--ink)}
    html.reloja-dark input,html.reloja-dark select,html.reloja-dark textarea{background:var(--bg)!important;color:var(--ink)!important;border-color:var(--line-strong)!important}
    html.reloja-dark .policy-card,html.reloja-dark .cart-panel,html.reloja-dark .account-card,html.reloja-dark .product-card{background:var(--bg-soft);color:var(--ink)}
    html.reloja-dark .section-black,html.reloja-dark footer{background:#050506}
    html.reloja-dark img{filter:none}
    @media(min-width:901px){body.reloja-home-accessibility-rail .reloja-accessibility-header{display:none}}
    @media(max-width:900px){.reloja-accessibility-rail{display:none}.reloja-accessibility-header{display:flex;margin-left:auto;margin-right:8px}.reloja-accessibility-button{width:28px;height:28px;font-size:.62rem}}
    @media(max-width:640px){.reloja-accessibility-header{gap:3px}.reloja-accessibility-button{width:27px;height:27px}}
  `;
  document.head.appendChild(style);
}

function sincronizarControlesAcessibilidade() {
  const contraste = document.documentElement.classList.contains('reloja-high-contrast');
  const textoMaior = document.documentElement.classList.contains('reloja-large-text');
  const escuro = document.documentElement.classList.contains('reloja-dark');

  document.querySelectorAll('[data-reloja-accessibility="contrast"]').forEach(button => {
    button.setAttribute('aria-pressed', contraste ? 'true' : 'false');
    button.setAttribute('aria-label', contraste ? 'Desativar alto contraste' : 'Ativar alto contraste');
    button.title = contraste ? 'Desativar alto contraste' : 'Ativar alto contraste';
  });
  document.querySelectorAll('[data-reloja-accessibility="text"]').forEach(button => {
    button.setAttribute('aria-pressed', textoMaior ? 'true' : 'false');
    button.setAttribute('aria-label', textoMaior ? 'Voltar ao tamanho normal do texto' : 'Aumentar o tamanho do texto');
    button.title = textoMaior ? 'Tamanho normal do texto' : 'Aumentar texto';
  });
  document.querySelectorAll('[data-reloja-accessibility="theme"]').forEach(button => {
    button.setAttribute('aria-pressed', escuro ? 'true' : 'false');
    button.setAttribute('aria-label', escuro ? 'Ativar modo claro' : 'Ativar modo escuro');
    button.title = escuro ? 'Modo claro' : 'Modo escuro';
    button.textContent = escuro ? '☀' : '☾';
  });
}

function alternarRecursoAcessibilidade(tipo) {
  if (tipo === 'contrast') {
    const ativar = !document.documentElement.classList.contains('reloja-high-contrast');
    document.documentElement.classList.toggle('reloja-high-contrast', ativar);
    salvarPreferenciaBooleana(CHAVE_CONTRASTE, ativar);
    if (ativar) {
      document.documentElement.classList.remove('reloja-dark');
      salvarPreferenciaBooleana(CHAVE_MODO_ESCURO, false);
    }
  } else if (tipo === 'text') {
    const ativar = !document.documentElement.classList.contains('reloja-large-text');
    document.documentElement.classList.toggle('reloja-large-text', ativar);
    salvarPreferenciaBooleana(CHAVE_TEXTO_MAIOR, ativar);
  } else if (tipo === 'theme') {
    const ativar = !document.documentElement.classList.contains('reloja-dark');
    document.documentElement.classList.toggle('reloja-dark', ativar);
    salvarPreferenciaBooleana(CHAVE_MODO_ESCURO, ativar);
    if (ativar) {
      document.documentElement.classList.remove('reloja-high-contrast');
      salvarPreferenciaBooleana(CHAVE_CONTRASTE, false);
    }
  }
  sincronizarControlesAcessibilidade();
}

function criarGrupoAcessibilidade(classeExtra) {
  const group = document.createElement('div');
  group.className = `reloja-accessibility-controls ${classeExtra}`;
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Opções de acessibilidade e visualização');

  const itens = [
    { tipo: 'contrast', simbolo: '◐', classe: 'reloja-contrast-toggle', rotulo: 'Ativar alto contraste' },
    { tipo: 'text', simbolo: 'A+', classe: '', rotulo: 'Aumentar o tamanho do texto' },
    { tipo: 'theme', simbolo: '☾', classe: '', rotulo: 'Ativar modo escuro' }
  ];

  itens.forEach(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `reloja-accessibility-button ${item.classe}`.trim();
    button.dataset.relojaAccessibility = item.tipo;
    button.textContent = item.simbolo;
    button.setAttribute('aria-label', item.rotulo);
    button.setAttribute('aria-pressed', 'false');
    button.title = item.rotulo;
    button.addEventListener('click', () => alternarRecursoAcessibilidade(item.tipo));
    group.appendChild(button);
  });

  return group;
}

function garantirControlesAcessibilidade() {
  garantirEstilosAcessibilidade();

  const nav = document.querySelector('.site-header .nav');
  if (nav && !nav.querySelector('.reloja-accessibility-header')) {
    const headerGroup = criarGrupoAcessibilidade('reloja-accessibility-header');
    const cta = nav.querySelector('.nav-cta');
    const toggle = nav.querySelector('.nav-toggle');
    nav.insertBefore(headerGroup, cta || toggle || null);
  }

  const homeRail = document.querySelector('.hero .frame > .rail');
  const railMark = homeRail?.querySelector('.rail-mark');
  if (homeRail && railMark && !homeRail.querySelector('.reloja-accessibility-rail')) {
    const railGroup = criarGrupoAcessibilidade('reloja-accessibility-rail');
    railMark.insertAdjacentElement('afterend', railGroup);
    document.body.classList.add('reloja-home-accessibility-rail');
  }

  sincronizarControlesAcessibilidade();
}

document.addEventListener('DOMContentLoaded', garantirControlesAcessibilidade);

/* ---------- Relógio analógico com horário de Brasília (elemento-assinatura) ---------- */
function iniciarCronometro() {
  const svg = document.getElementById('analog-clock');
  if (!svg) return;

  const ticksGroup = document.getElementById('clock-ticks');
  const handHour = document.getElementById('hand-hour');
  const handMinute = document.getElementById('hand-minute');
  const handSecondGroup = document.getElementById('hand-second');
  const dataEl = document.getElementById('stopwatch-data');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const formatoData = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  /* Brasília não observa horário de verão desde 2019: UTC-3 fixo. */
  function horaBrasilia() {
    const agora = new Date();
    const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60000;
    return new Date(utcMs - 3 * 3600000);
  }

  /* Desenha os índices do mostrador: barras nas horas, traços nos minutos. */
  function desenharIndices() {
    const cx = 100, cy = 100;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 60; i++) {
      const ehHora = i % 5 === 0;
      const raioExterno = 90;
      const raioInterno = ehHora ? 74 : 82;
      const angulo = (i * 6) * (Math.PI / 180);
      const x1 = cx + raioInterno * Math.sin(angulo);
      const y1 = cy - raioInterno * Math.cos(angulo);
      const x2 = cx + raioExterno * Math.sin(angulo);
      const y2 = cy - raioExterno * Math.cos(angulo);

      const linha = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      linha.setAttribute('x1', x1.toFixed(2));
      linha.setAttribute('y1', y1.toFixed(2));
      linha.setAttribute('x2', x2.toFixed(2));
      linha.setAttribute('y2', y2.toFixed(2));
      linha.setAttribute('class', ehHora ? 'tick-hour' : 'tick-minute');
      frag.appendChild(linha);
    }
    ticksGroup.appendChild(frag);
  }

  function atualizarData(agoraBrasilia) {
    if (!dataEl) return;
    let dataFormatada = formatoData.format(agoraBrasilia);
    dataFormatada = dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1);
    dataEl.textContent = `${dataFormatada} · Horário de Brasília (UTC-3)`;
  }

  let ultimoMinutoExibido = -1;

  function atualizarPonteiros() {
    const bsb = horaBrasilia();
    const h = bsb.getUTCHours() % 12;
    const m = bsb.getUTCMinutes();
    const s = bsb.getUTCSeconds();
    const ms = bsb.getUTCMilliseconds();
    const segundosFracionados = s + ms / 1000;

    /* Ponteiros de hora e minuto: varredura suave e contínua. */
    const anguloHora = (h + m / 60) * 30;
    const anguloMinuto = (m + s / 60) * 6;
    handHour.style.transform = `rotate(${anguloHora}deg)`;
    handMinute.style.transform = `rotate(${anguloMinuto}deg)`;

    /* Ponteiro de segundos ao ritmo de um relógio de estação:
       varredura fluida (como um automático) durante 58,5s e uma
       pequena pausa no topo aguardando o pulso do próximo minuto. */
    let anguloSegundo;
    if (reduceMotion) {
      anguloSegundo = s * 6;
    } else if (segundosFracionados <= 58.5) {
      anguloSegundo = (segundosFracionados / 58.5) * 360;
    } else {
      anguloSegundo = 360;
    }
    handSecondGroup.style.transform = `rotate(${anguloSegundo}deg)`;

    if (m !== ultimoMinutoExibido) {
      ultimoMinutoExibido = m;
      atualizarData(bsb);
    }
  }

  function loop() {
    atualizarPonteiros();
    if (!reduceMotion) {
      requestAnimationFrame(loop);
    }
  }

  desenharIndices();
  atualizarPonteiros();
  atualizarData(horaBrasilia());

  if (reduceMotion) {
    setInterval(atualizarPonteiros, 1000);
  } else {
    requestAnimationFrame(loop);
  }
}
document.addEventListener('DOMContentLoaded', iniciarCronometro);

/* ---------- Utilitário: formatação de preço em BRL ---------- */
function formatarPreco(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
