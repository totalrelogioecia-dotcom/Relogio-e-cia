/* =========================================================
   RELÓGIO E CIA — script.js (v2)
   ========================================================= */

/* =========================================================
   CONTA E CARRINHO (armazenamento local do navegador)
   O catálogo é carregado do backend; carrinho e sessão do cliente ficam no navegador.
   ========================================================= */
const CHAVE_CARRINHO = 'reloja_carrinho';
const CHAVE_SESSAO = 'reloja_sessao';

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
  return obterCarrinho().reduce((s, i) => s + (Number(i.qtd) || 0) * (Number(i.preco) || 0), 0);
}
function atualizarBadgeCarrinho() {
  document.querySelectorAll('.cart-badge').forEach(b => {
    const n = totalItensCarrinho();
    b.textContent = n;
    b.dataset.zero = n === 0 ? '1' : '0';
  });
}

/* ---------- Estado visual da conta (a autenticação real fica no servidor) ---------- */
function sessaoAtual() {
  try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO)); }
  catch { return null; }
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

  if (!links.querySelector('.nav-mobile-catalog')) {
    const catalogHref = catalog?.getAttribute('href') || 'produtos.html';
    links.insertAdjacentHTML('afterbegin', `<li class="nav-mobile-only nav-mobile-catalog"><a href="${escaparHtmlSeguro(catalogHref)}">Produtos</a></li>`);
  }

  if (!links.querySelector('.nav-mobile-account')) {
    const accountHref = utility?.querySelector('#nav-conta-link')?.getAttribute('href') || 'conta.html';
    const cartHref = utility?.querySelector('a[href*="carrinho"]')?.getAttribute('href') || 'carrinho.html';

    links.insertAdjacentHTML('beforeend', `
      <li class="nav-mobile-only nav-mobile-account"><a href="${escaparHtmlSeguro(accountHref)}">Minha conta</a></li>
      <li class="nav-mobile-only"><a href="${escaparHtmlSeguro(cartHref)}">Carrinho <span class="cart-badge" data-zero="1">0</span></a></li>
    `);
    atualizarBadgeCarrinho();
  }

  toggle.textContent = 'Menu';
  toggle.setAttribute('aria-label', 'Abrir menu');
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.textContent = open ? 'Fechar' : 'Menu';
    toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  links.addEventListener('click', event => {
    if (!event.target.closest('a')) return;
    links.classList.remove('open');
    toggle.textContent = 'Menu';
    toggle.setAttribute('aria-expanded', 'false');
  });
});

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
  const amount = Number(v);
  return (Number.isFinite(amount) ? amount : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escaparHtmlSeguro(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
}

function urlImagemSegura(value) {
  const raw = String(value || '').trim();
  if (/^data:image\/(?:avif|gif|jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(raw)) return raw;
  try {
    const url = new URL(raw, location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

/* ---------- Utilitário: fallback quando uma foto não carrega ---------- */
function tratarErroFoto(img) {
  const wrap = img.parentElement;
  img.remove();
  if (wrap && !wrap.querySelector('.card-photo-placeholder')) {
    const span = document.createElement('span');
    span.className = 'card-photo-placeholder';
    span.textContent = 'Foto em breve';
    wrap.appendChild(span);
  }
}
window.tratarErroFoto = tratarErroFoto;

/* Monta a URL da foto oficial no site da Casio a partir do SKU.
   linha: 'gshock' ou 'casio' (define a pasta de assets usada pelo site da fabricante).
   variante=true retorna a versão em alta (main-visual-pc) da mesma imagem. */
function fotoCasio(sku, linha, variante) {
  const semHifen = sku.replace(/-/g, '');
  const p1 = semHifen.slice(0, 1);
  const p2 = semHifen.slice(0, 2);
  const p3 = semHifen.slice(0, 3);
  const pasta = linha === 'gshock' ? 'us-assets' : 'assets';
  const base = `https://www.casio.com/content/dam/casio/product-info/locales/us/en/timepiece/product/watch/${p1}/${p2}/${p3}/${sku}/${pasta}/${sku}.png`;
  return variante ? `${base}.transform/main-visual-pc/image.png` : base;
}

/* ---------- Catálogo de produtos ---------- */
let PRODUTOS = [
  { id:1,  nome:'Technos Legacy Automatic',      marca:'Technos',  categoria:'Relógios', preco:899.90,  sku:'TEC-LG-2201', desc:'Caixa em aço escovado 40mm, movimento automático visível pelo fundo em vidro mineral.' },
  { id:2,  nome:'Technos Skydiver Solar',        marca:'Technos',  categoria:'Relógios', preco:649.00,  sku:'TEC-SK-1187', desc:'Carga solar, resistência a 100m e cronógrafo — ideal para o dia a dia ativo.' },
  { id:3,  nome:'Technos Elos Feminino',         marca:'Technos',  categoria:'Relógios', preco:429.90,  sku:'TEC-EL-0942', desc:'Pulseira em malha milanesa, mostrador madrepérola e caixa 32mm.' },
  { id:4,  nome:'Casio Vintage A168',            marca:'Casio',    categoria:'Relógios', preco:349.00,  sku:'CAS-A168-01', desc:'O clássico digital retrô, caixa dourada e alarme com iluminação LED.' },
  { id:5,  nome:'Casio Edifice Cronógrafo',      marca:'Casio',    categoria:'Relógios', preco:799.00,  sku:'CAS-EDI-330', desc:'Inspirado na performance automotiva, taquímetro e resistência a 100m.' },
  { id:6,  nome:'Casio Standard Digital F91W',   marca:'Casio',    categoria:'Relógios', preco:129.90,  sku:'CAS-F91W',    desc:'O digital mais vendido do mundo — leve, discreto e à prova d\'água.' },
  { id:7,  nome:'G-Shock GA-2100 "CasiOak"',     marca:'G-Shock',  categoria:'Relógios', preco:1099.00, sku:'GSH-GA2100',  desc:'Estrutura em carbono ultrafina, resistente a choques e à água até 200m.' },
  { id:8,  nome:'G-Shock Mudmaster',             marca:'G-Shock',  categoria:'Relógios', preco:2299.00, sku:'GSH-MUD-40',  desc:'Proteção total contra lama, choque e pressão barométrica para uso extremo.' },
  { id:9,  nome:'G-Shock DW-5600 Clássico',      marca:'G-Shock',  categoria:'Relógios', preco:699.00,  sku:'GSH-DW5600',  desc:'O modelo original de 1983 em nova geração, resistência a choques garantida.' },
  { id:10, nome:'Citizen Eco-Drive Sapphire',    marca:'Citizen',  categoria:'Relógios', preco:1899.00, sku:'CIT-ECO-778', desc:'Movimento alimentado por luz, nunca precisa trocar pilha. Vidro de safira.' },
  { id:11, nome:'Citizen Promaster Diver',       marca:'Citizen',  categoria:'Relógios', preco:2599.00, sku:'CIT-PRO-200', desc:'Mergulho profissional, resistente a 200m, coroa protegida e luneta unidirecional.' },
  { id:12, nome:'Citizen Elegance Feminino',     marca:'Citizen',  categoria:'Relógios', preco:1349.00, sku:'CIT-ELG-514', desc:'Design refinado com cristais aplicados e pulseira em aço banhado a ouro rosé.' },
  { id:13, nome:'Orient Automatic Classic',      marca:'Orient',   categoria:'Relógios', preco:1199.00, sku:'ORI-AUT-621', desc:'Corda automática tradicional, visor do movimento e reserva de marcha de 40h.' },
  { id:14, nome:'Orient King Diver',             marca:'Orient',   categoria:'Relógios', preco:1799.00, sku:'ORI-KD-303',  desc:'Ícone da mergulhia japonesa, caixa robusta e resistência a 200m.' },
  { id:15, nome:'Orient Sports Chronograph',     marca:'Orient',   categoria:'Relógios', preco:949.00,  sku:'ORI-SPT-118', desc:'Cronógrafo esportivo com mostrador em camadas e pulseira em couro legítimo.' },

  { id:16, nome:'Pulseira Couro Legítimo 20mm',  marca:'Universal', categoria:'Pulseiras', preco:79.90,  sku:'ACC-PUL-020', desc:'Couro curtido artesanalmente, disponível em preto, marrom e caramelo.' },
  { id:17, nome:'Pulseira Aço Milanesa 18mm',    marca:'Universal', categoria:'Pulseiras', preco:119.90, sku:'ACC-PUL-018', desc:'Malha milanesa ajustável com fecho magnético, acabamento prata ou dourado.' },
  { id:18, nome:'Pulseira Silicone Esportiva',   marca:'G-Shock',   categoria:'Pulseiras', preco:89.90,  sku:'GSH-PUL-SIL', desc:'Compatível com linha G-Shock, resistente a suor e água.' },
  { id:19, nome:'Pulseira NATO Nylon',           marca:'Universal', categoria:'Pulseiras', preco:59.90,  sku:'ACC-PUL-NAT', desc:'Tecido balístico de alta resistência, estilo militar, várias cores.' },

  { id:20, nome:'Pilha SR626SW (kit 2un)',       marca:'Universal', categoria:'Pilhas',    preco:19.90,  sku:'ACC-PIL-626', desc:'Pilha de óxido de prata para relógios de quartzo, alta durabilidade.' },
  { id:21, nome:'Pilha CR2032 (kit 2un)',        marca:'Universal', categoria:'Pilhas',    preco:17.90,  sku:'ACC-PIL-2032',desc:'Compatível com a maioria dos relógios digitais e analógicos.' },
  { id:22, nome:'Kit Pilhas Sortidas (10un)',    marca:'Universal', categoria:'Pilhas',    preco:69.90,  sku:'ACC-PIL-KIT', desc:'Kit com as pilhas mais usadas em relojoaria para reposição doméstica.' },

  { id:23, nome:'Estojo Porta-Relógios 6 Nichos',marca:'Universal', categoria:'Acessórios', preco:189.90, sku:'ACC-EST-006', desc:'Estrutura em madeira laqueada com veludo interno, ideal para coleções.' },
  { id:24, nome:'Kit Ferramentas Relojoeiro',    marca:'Universal', categoria:'Acessórios', preco:99.90,  sku:'ACC-FER-KIT', desc:'Chaves, alicates e abridores para troca de pilha e ajustes de pulseira.' },
  { id:25, nome:'Protetor de Tela Curvo (3un)',  marca:'Universal', categoria:'Acessórios', preco:34.90,  sku:'ACC-PRO-003', desc:'Película curva de alta transparência para vidros de relógio esportivo.' },

  /* ---- G-Shock (linha ampliada) ---- */
  { id:26, nome:'G-Shock Rangeman GPR-H1000-9DR', marca:'G-Shock', categoria:'Relógios', preco:3999.00, sku:'GPR-H1000-9', desc:'Master of G com GPS integrado, monitor de frequência cardíaca no pulso e tela MIP de alto contraste, feito para expedições extremas.', fotos:[fotoCasio('GPR-H1000-9','gshock'), fotoCasio('GPR-H1000-9','gshock',true)] },
  { id:27, nome:'G-Shock DW-5600UBB-1DR All Black', marca:'G-Shock', categoria:'Relógios', preco:479.00, sku:'DW-5600UBB-1', desc:'O clássico quadrado G-Shock em visual totalmente preto, resistência a choques e à água até 200m.', fotos:[fotoCasio('DW-5600UBB-1','gshock'), fotoCasio('DW-5600UBB-1','gshock',true)] },
  { id:28, nome:'G-Shock GA-2100-1A "CasiOak"', marca:'G-Shock', categoria:'Relógios', preco:799.00, sku:'GA-2100-1A', desc:'Estrutura Carbon Core Guard ultrafina, formato octogonal que virou ícone, resistente a choques e à água até 200m.', fotos:[fotoCasio('GA-2100-1A','gshock'), fotoCasio('GA-2100-1A','gshock',true)] },
  { id:29, nome:'G-Shock GA-2100-1A1 "CasiOak" Preto', marca:'G-Shock', categoria:'Relógios', preco:799.00, sku:'GA-2100-1A1', desc:'Versão monocromática preta do icônico GA-2100, caixa em resina com fibra de carbono e apenas 11,8mm de espessura.', fotos:[fotoCasio('GA-2100-1A1','gshock'), fotoCasio('GA-2100-1A1','gshock',true)] },
  { id:30, nome:'G-Shock DW-5600UHR-1DR', marca:'G-Shock', categoria:'Relógios', preco:549.00, sku:'DW-5600UHR-1', desc:'Quadrado clássico da série 5600 com detalhes em vermelho, resistência a choques e à água até 200m.', fotos:[fotoCasio('DW-5600UHR-1','gshock'), fotoCasio('DW-5600UHR-1','gshock',true)] },
  { id:31, nome:'G-Shock DW-5600RL-1DR', marca:'G-Shock', categoria:'Relógios', preco:599.00, sku:'DW-5600RL-1', desc:'Edição da série 5600 com padronagem exclusiva na pulseira, resistência a choques e à água até 200m.', fotos:[fotoCasio('DW-5600RL-1','gshock'), fotoCasio('DW-5600RL-1','gshock',true)] },
  { id:32, nome:'G-Shock GA-100-1A4DR', marca:'G-Shock', categoria:'Relógios', preco:699.00, sku:'GA-100-1A4', desc:'Anadigi robusto com detalhes em verde, cronógrafo e resistência a choques e à água até 200m.', fotos:[fotoCasio('GA-100-1A4','gshock'), fotoCasio('GA-100-1A4','gshock',true)] },
  { id:33, nome:'G-Shock GA-100-1A2DR', marca:'G-Shock', categoria:'Relógios', preco:699.00, sku:'GA-100-1A2', desc:'Anadigi robusto com detalhes em azul, cronógrafo e resistência a choques e à água até 200m.', fotos:[fotoCasio('GA-100-1A2','gshock'), fotoCasio('GA-100-1A2','gshock',true)] },
  { id:34, nome:'G-Shock GA-100-1A1DR', marca:'G-Shock', categoria:'Relógios', preco:699.00, sku:'GA-100-1A1', desc:'Anadigi robusto totalmente preto, cronógrafo e resistência a choques e à água até 200m.', fotos:[fotoCasio('GA-100-1A1','gshock'), fotoCasio('GA-100-1A1','gshock',true)] },
  { id:35, nome:'G-Shock G-7900-2DR Tábua de Maré', marca:'G-Shock', categoria:'Relógios', preco:599.00, sku:'G-7900-2', desc:'Linha G-Rescue com tábua de maré e fase lunar, ideal para atividades ao ar livre e esportes aquáticos.', fotos:[fotoCasio('G-7900-2','gshock'), fotoCasio('G-7900-2','gshock',true)] },
  { id:36, nome:'G-Shock G-7900A-4DR Tábua de Maré', marca:'G-Shock', categoria:'Relógios', preco:599.00, sku:'G-7900A-4', desc:'Linha G-Rescue com tábua de maré e fase lunar em nova colorização, resistência a choques e à água até 200m.', fotos:[fotoCasio('G-7900A-4','gshock'), fotoCasio('G-7900A-4','gshock',true)] },
  { id:37, nome:'G-Shock DW-5600UE-1DR', marca:'G-Shock', categoria:'Relógios', preco:449.00, sku:'DW-5600UE-1', desc:'O quadrado essencial da série 5600, simples, resistente e com o DNA original do G-Shock de 1983.', fotos:[fotoCasio('DW-5600UE-1','gshock'), fotoCasio('DW-5600UE-1','gshock',true)] },
  { id:38, nome:'G-Shock DW-5750UE-1DR', marca:'G-Shock', categoria:'Relógios', preco:549.00, sku:'DW-5750UE-1', desc:'Variação da série 5600 com caixa levemente maior, resistência a choques e à água até 200m.', fotos:[fotoCasio('DW-5750UE-1','gshock'), fotoCasio('DW-5750UE-1','gshock',true)] },

  /* ---- Casio Vintage / Standard ---- */
  { id:39, nome:'Casio Vintage AQ-230A-1DMQ', marca:'Casio', categoria:'Relógios', preco:259.00, sku:'AQ-230A-1DMQ', desc:'Analógico-digital combinado em aço inox, calendário automático e cronômetro, visual atemporal.', fotos:[fotoCasio('AQ-230A-1DMQ','casio'), fotoCasio('AQ-230A-1DMQ','casio',true)] },
  { id:40, nome:'Casio Vintage AQ-230A-7DMQ', marca:'Casio', categoria:'Relógios', preco:259.00, sku:'AQ-230A-7DMQ', desc:'Analógico-digital combinado em prata, calendário automático e cronômetro, visual atemporal.', fotos:[fotoCasio('AQ-230A-7DMQ','casio'), fotoCasio('AQ-230A-7DMQ','casio',true)] },
  { id:41, nome:'Casio Vintage A158WA-1', marca:'Casio', categoria:'Relógios', preco:259.00, sku:'A158WA-1', desc:'O digital retrô mais icônico da Casio, caixa e pulseira em aço inox prateado, LED de fundo.', fotos:[fotoCasio('A158WA-1','casio'), fotoCasio('A158WA-1','casio',true)] },
  { id:42, nome:'Casio Vintage LA680WA-1B', marca:'Casio', categoria:'Relógios', preco:219.00, sku:'LA680WA-1B', desc:'Digital vintage feminino, caixa compacta em preto, alarme e cronômetro.', fotos:[fotoCasio('LA680WA-1B','casio'), fotoCasio('LA680WA-1B','casio',true)] },
  { id:43, nome:'Casio Vintage LA680WA-7', marca:'Casio', categoria:'Relógios', preco:219.00, sku:'LA680WA-7', desc:'Digital vintage feminino, caixa compacta prateada, alarme e cronômetro.', fotos:[fotoCasio('LA680WA-7','casio'), fotoCasio('LA680WA-7','casio',true)] },
  { id:44, nome:'Casio Duro MDV-107D-1A1V', marca:'Casio', categoria:'Relógios', preco:459.00, sku:'MDV-107D-1A1V', desc:'Mergulhador robusto com resistência à água de 200m, luneta unidirecional e mostrador de alta legibilidade.', fotos:[fotoCasio('MDV-107D-1A1V','casio'), fotoCasio('MDV-107D-1A1V','casio',true)] },
  { id:45, nome:'Casio Duro MDV-107D-1A3V', marca:'Casio', categoria:'Relógios', preco:459.00, sku:'MDV-107D-1A3V', desc:'Mergulhador robusto com resistência à água de 200m, detalhes em azul e luneta unidirecional.', fotos:[fotoCasio('MDV-107D-1A3V','casio'), fotoCasio('MDV-107D-1A3V','casio',true)] },
  { id:46, nome:'Casio Duro MDV-107D-1A2V', marca:'Casio', categoria:'Relógios', preco:459.00, sku:'MDV-107D-1A2V', desc:'Mergulhador robusto com resistência à água de 200m, detalhes em verde e luneta unidirecional.', fotos:[fotoCasio('MDV-107D-1A2V','casio'), fotoCasio('MDV-107D-1A2V','casio',true)] },
  { id:47, nome:'Casio Vintage LA670WGA-1', marca:'Casio', categoria:'Relógios', preco:289.00, sku:'LA670WGA-1', desc:'Digital vintage feminino em tom dourado, caixa fina e visual elegante.', fotos:[fotoCasio('LA670WGA-1','casio'), fotoCasio('LA670WGA-1','casio',true)] },
  { id:48, nome:'Casio Vintage LA670WGA-9', marca:'Casio', categoria:'Relógios', preco:289.00, sku:'LA670WGA-9', desc:'Digital vintage feminino em tom dourado claro, caixa fina e visual elegante.', fotos:[fotoCasio('LA670WGA-9','casio'), fotoCasio('LA670WGA-9','casio',true)] },
  { id:49, nome:'Casio Vintage A171WEG-9A', marca:'Casio', categoria:'Relógios', preco:329.00, sku:'A171WEG-9A', desc:'Digital retrô em banho dourado, pulseira em aço inox e visual sofisticado.', fotos:[fotoCasio('A171WEG-9A','casio'), fotoCasio('A171WEG-9A','casio',true)] },
  { id:50, nome:'Casio Vintage B640WB-1A', marca:'Casio', categoria:'Relógios', preco:349.00, sku:'B640WB-1A', desc:'Digital vintage com caixa preta e detalhes dourados, pulseira em aço inox.', fotos:[fotoCasio('B640WB-1A','casio'), fotoCasio('B640WB-1A','casio',true)] },
  { id:51, nome:'Casio Vintage LA670WA-1', marca:'Casio', categoria:'Relógios', preco:249.00, sku:'LA670WA-1', desc:'Digital vintage feminino em prata, caixa fina e pulseira em aço inox.', fotos:[fotoCasio('LA670WA-1','casio'), fotoCasio('LA670WA-1','casio',true)] },
  { id:52, nome:'Casio Vintage B640WC-5A', marca:'Casio', categoria:'Relógios', preco:349.00, sku:'B640WC-5A', desc:'Digital vintage com caixa em tom ouro rosé, pulseira em aço inox.', fotos:[fotoCasio('B640WC-5A','casio'), fotoCasio('B640WC-5A','casio',true)] },
  { id:53, nome:'Casio Vintage A159WGEA-1', marca:'Casio', categoria:'Relógios', preco:309.00, sku:'A159WGEA-1', desc:'Digital retrô com caixa preta e dourada, pulseira em aço inox banhado a ouro.', fotos:[fotoCasio('A159WGEA-1','casio'), fotoCasio('A159WGEA-1','casio',true)] },
  { id:54, nome:'Casio Vintage AQ-230GA-9DMQ', marca:'Casio', categoria:'Relógios', preco:289.00, sku:'AQ-230GA-9DMQ', desc:'Analógico-digital combinado em tom dourado, calendário automático e cronômetro.', fotos:[fotoCasio('AQ-230GA-9DMQ','casio'), fotoCasio('AQ-230GA-9DMQ','casio',true)] },
];

/* ---------- Carregamento do catálogo pelo backend ---------- */
let catalogoCarregamento = null;

function quandoCatalogoPronto(callback) {
  if (!catalogoCarregamento) {
    const endpointCatalogo = document.querySelector('#marcas .brand-index')
      ? '/api/products/home'
      : '/api/products';
    catalogoCarregamento = fetch(endpointCatalogo, { cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error(`Falha ao carregar produtos (${res.status})`);
        return res.json();
      })
      .then(produtos => {
        if (!Array.isArray(produtos)) throw new Error('Resposta de produtos inválida.');
        // O backend é a fonte oficial do catálogo.
        if (produtos.length) PRODUTOS = produtos;
        return PRODUTOS;
      })
      .catch(err => {
        // Mantém o catálogo embutido como fallback caso a API fique temporariamente indisponível.
        console.error('Não foi possível carregar o catálogo do servidor:', err);
        return PRODUTOS;
      });
  }
  return catalogoCarregamento.then(() => callback());
}

/* ---------- Lógica da página de produtos ---------- */
function iniciarPaginaProdutos() {
  const grid = document.getElementById('product-grid');
  if (!grid) return; // não é a página de produtos

  const brandInputs = Array.from(document.querySelectorAll('input[name="marca"]'));
  const catInputs = Array.from(document.querySelectorAll('input[name="categoria"]'));
  const minPriceInput = document.getElementById('preco-min');
  const maxPriceInput = document.getElementById('preco-max');
  const sortSelect = document.getElementById('ordenar');
  const resetBtn = document.getElementById('reset-filtros');
  const countEl = document.getElementById('result-count');
  const filtersPanel = document.querySelector('.products-layout .filters');
  const activeFiltersEl = document.getElementById('catalog-active-filters');
  let activeFilterTargets = new Map();

  function getFiltros() {
    const marcas = brandInputs.filter(i => i.checked).map(i => i.value);
    const categorias = catInputs.filter(i => i.checked).map(i => i.value);
    const min = parseFloat(minPriceInput.value) || 0;
    const max = parseFloat(maxPriceInput.value) || Infinity;
    return { marcas, categorias, min, max, ordenar: sortSelect.value };
  }

  function filterGroupLabel(input) {
    const legend = input.closest('fieldset')?.querySelector('legend');
    return legend?.textContent.trim() || 'Filtro';
  }

  function renderActiveFilters() {
    if (!filtersPanel || !activeFiltersEl) return;

    const selected = Array.from(filtersPanel.querySelectorAll('input[type="checkbox"]:checked, input[type="radio"]:checked'))
      .map(input => ({ input, label: `${filterGroupLabel(input)}: ${input.value}` }));

    if (minPriceInput.value) {
      selected.push({ input: minPriceInput, label: `A partir de ${formatarPreco(Number(minPriceInput.value))}` });
    }
    if (maxPriceInput.value) {
      selected.push({ input: maxPriceInput, label: `Até ${formatarPreco(Number(maxPriceInput.value))}` });
    }

    activeFiltersEl.replaceChildren();
    activeFilterTargets = new Map();
    activeFiltersEl.hidden = selected.length === 0;
    if (!selected.length) return;

    selected.forEach(({ input, label }, index) => {
      const key = String(index);
      activeFilterTargets.set(key, input);

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'catalog-filter-chip';
      chip.dataset.filterTarget = key;
      chip.setAttribute('aria-label', `Remover filtro ${label}`);

      const text = document.createElement('span');
      text.textContent = label;
      const close = document.createElement('span');
      close.className = 'catalog-filter-chip-close';
      close.setAttribute('aria-hidden', 'true');
      close.textContent = '×';

      chip.append(text, close);
      activeFiltersEl.appendChild(chip);
    });

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'catalog-filter-clear';
    clear.dataset.clearCatalogFilters = '1';
    clear.textContent = 'Limpar todos';
    activeFiltersEl.appendChild(clear);
  }

  function aplicarFiltros() {
    const { marcas, categorias, min, max, ordenar } = getFiltros();

    let resultado = PRODUTOS.filter(p => {
      const okMarca = marcas.length === 0 || marcas.includes(p.marca);
      const okCategoria = categorias.length === 0 || categorias.includes(p.categoria);
      const okPreco = p.preco >= min && p.preco <= max;
      return okMarca && okCategoria && okPreco;
    });

    switch (ordenar) {
      case 'pronta-entrega':
        resultado.sort((a, b) => {
          const rankA = Number(a.estoque || 0) > 0 ? 0 : 1;
          const rankB = Number(b.estoque || 0) > 0 ? 0 : 1;
          return rankA - rankB || a.id - b.id;
        });
        break;
      case 'preco-asc':
        resultado.sort((a, b) => a.preco - b.preco);
        break;
      case 'preco-desc':
        resultado.sort((a, b) => b.preco - a.preco);
        break;
      case 'nome-asc':
        resultado.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        break;
      default:
        resultado.sort((a, b) => a.id - b.id);
    }

    renderizar(resultado);
  }

  function renderizar(lista) {
    countEl.innerHTML = `<strong>${lista.length}</strong> produto${lista.length === 1 ? '' : 's'} encontrado${lista.length === 1 ? '' : 's'}`;

    if (lista.length === 0) {
      grid.innerHTML = `
        <div class="empty-state catalog-empty-state">
          <strong>Nenhum produto combina com estes filtros</strong>
          <p>Remova algum filtro ou limpe a seleção para voltar ao catálogo completo.</p>
          <button class="btn btn-outline catalog-empty-reset" type="button" data-reset-catalog-filters>Limpar filtros</button>
        </div>`;
      return;
    }

    grid.innerHTML = lista.map(p => {
      const id = Number(p.id);
      if (!Number.isSafeInteger(id) || id <= 0) return '';
      const primeiraFoto = urlImagemSegura((p.fotos && p.fotos[0]) || p.foto);
      const productUrl = `produto.html?id=${id}`;
      const nome = escaparHtmlSeguro(p.nome);
      const marca = escaparHtmlSeguro(p.marca);
      return `
      <article class="product-card" data-product-id="${id}">
        <div class="card-photo">
          <a class="card-photo-link" href="${productUrl}">
            ${primeiraFoto
              ? `<img src="${escaparHtmlSeguro(primeiraFoto)}" alt="${nome}" loading="lazy" onerror="tratarErroFoto(this)">`
              : `<span class="card-photo-placeholder">Foto em breve</span>`}
          </a>
        </div>
        <div class="card-top">
          <span class="brand-chip">${marca}</span>
        </div>
        <h4><a class="product-title-link" href="${productUrl}">${nome}</a></h4>
        <p class="price">${formatarPreco(p.preco)}</p>
        <div class="card-actions">
          <a class="btn btn-outline" href="${productUrl}">Ver detalhes</a>
          <button class="btn btn-primary" type="button" data-add-carrinho="${id}">Adicionar</button>
        </div>
      </article>
    `;
    }).join('');

    grid.querySelectorAll('[data-add-carrinho]').forEach(btn => {
      btn.addEventListener('click', () => {
        adicionarAoCarrinho(parseInt(btn.dataset.addCarrinho, 10));
        const original = btn.textContent;
        btn.textContent = 'Adicionado ✓';
        setTimeout(() => { btn.textContent = original; }, 1400);
      });
    });
  }

  /* Os detalhes agora usam links comuns para a página individual do produto. */

  /* ---------- Contagem por marca/categoria nos filtros ---------- */
  function preencherContagens() {
    brandInputs.forEach(i => {
      const n = PRODUTOS.filter(p => p.marca === i.value).length;
      const el = i.closest('.check-row').querySelector('.count');
      if (el) el.textContent = n;
    });
    catInputs.forEach(i => {
      const n = PRODUTOS.filter(p => p.categoria === i.value).length;
      const el = i.closest('.check-row').querySelector('.count');
      if (el) el.textContent = n;
    });
  }

  /* ---------- Eventos ---------- */
  [...brandInputs, ...catInputs].forEach(i => i.addEventListener('change', aplicarFiltros));
  minPriceInput.addEventListener('input', aplicarFiltros);
  maxPriceInput.addEventListener('input', aplicarFiltros);
  sortSelect.addEventListener('change', aplicarFiltros);
  resetBtn.addEventListener('click', () => {
    [...brandInputs, ...catInputs].forEach(i => i.checked = false);
    minPriceInput.value = '';
    maxPriceInput.value = '';
    sortSelect.value = 'pronta-entrega';
    aplicarFiltros();
    window.setTimeout(renderActiveFilters, 0);
  });

  if (activeFiltersEl) {
    activeFiltersEl.addEventListener('click', event => {
      const clear = event.target.closest('[data-clear-catalog-filters]');
      if (clear) {
        resetBtn.click();
        return;
      }

      const chip = event.target.closest('[data-filter-target]');
      if (!chip) return;
      const input = activeFilterTargets.get(chip.dataset.filterTarget);
      if (!input) return;

      if (input.matches('input[type="checkbox"], input[type="radio"]')) input.checked = false;
      else input.value = '';

      input.dispatchEvent(new Event(input.type === 'number' ? 'input' : 'change', { bubbles: true }));
      document.getElementById('apply-filters')?.click();
      window.setTimeout(renderActiveFilters, 0);
    });
  }

  grid.addEventListener('click', event => {
    if (event.target.closest('[data-reset-catalog-filters]')) resetBtn.click();
  });

  if (filtersPanel) {
    filtersPanel.addEventListener('change', renderActiveFilters, true);
    filtersPanel.addEventListener('input', renderActiveFilters, true);
    new MutationObserver(renderActiveFilters).observe(filtersPanel, { childList: true, subtree: true });
  }

  preencherContagens();
  aplicarFiltros();
  renderActiveFilters();
}
document.addEventListener('DOMContentLoaded', () => quandoCatalogoPronto(iniciarPaginaProdutos));

/* =========================================================
   Página: carrinho.html
   ========================================================= */
function iniciarPaginaCarrinho() {
  const lista = document.getElementById('cart-list');
  if (!lista) return;

  const resumoSubtotal = document.getElementById('cart-subtotal');
  const resumoTotal = document.getElementById('cart-total');
  const formasPagamento = document.getElementById('payment-form');
  const btnFinalizar = document.getElementById('btn-finalizar');
  const mensagem = document.getElementById('cart-msg');

  function desconto(itens, forma) {
    const subtotal = itens.reduce((s, i) => s + (Number(i.qtd) || 0) * (Number(i.preco) || 0), 0);
    return forma === 'pix' ? subtotal * 0.05 : 0;
  }

  function render() {
    const itens = obterCarrinho();

    if (itens.length === 0) {
      lista.innerHTML = `
        <div class="empty-state">
          <p>Seu carrinho está vazio.</p>
          <a class="btn btn-primary" href="produtos.html">Ver produtos</a>
        </div>`;
      document.getElementById('cart-summary-box').style.display = 'none';
      return;
    }
    document.getElementById('cart-summary-box').style.display = 'block';

    lista.innerHTML = itens.map(i => {
      const id = Number(i.id);
      if (!Number.isSafeInteger(id) || id <= 0) return '';
      const qtd = Math.max(1, Math.min(99, Math.floor(Number(i.qtd) || 1)));
      const preco = Math.max(0, Number(i.preco) || 0);
      const foto = urlImagemSegura(i.foto);
      return `
      <div class="cart-item">
        <div class="cart-item-photo">
          ${foto ? `<img src="${escaparHtmlSeguro(foto)}" alt="${escaparHtmlSeguro(i.nome)}" onerror="tratarErroFoto(this)">` : ''}
        </div>
        <div class="cart-item-info">
          <h4>${escaparHtmlSeguro(i.nome)}</h4>
          <p class="sku">Ref. ${escaparHtmlSeguro(i.sku)} · ${formatarPreco(preco)}</p>
          <button class="cart-item-remove" type="button" data-remover="${id}">Remover</button>
        </div>
        <div class="qty-stepper">
          <button type="button" data-menos="${id}">−</button>
          <span>${qtd}</span>
          <button type="button" data-mais="${id}">+</button>
        </div>
        <strong>${formatarPreco(qtd * preco)}</strong>
      </div>
    `;
    }).join('');

    const forma = (formasPagamento.querySelector('input[name="pagamento"]:checked') || {}).value || 'pix';
    const subtotal = totalCarrinho();
    const desc = desconto(itens, forma);
    resumoSubtotal.textContent = formatarPreco(subtotal);
    resumoTotal.textContent = formatarPreco(subtotal - desc);

    const linhaDesconto = document.getElementById('cart-desconto-row');
    if (desc > 0) {
      linhaDesconto.style.display = 'flex';
      document.getElementById('cart-desconto').textContent = '− ' + formatarPreco(desc);
    } else {
      linhaDesconto.style.display = 'none';
    }

    lista.querySelectorAll('[data-remover]').forEach(b => b.addEventListener('click', () => {
      removerDoCarrinho(parseInt(b.dataset.remover, 10)); render();
    }));
    lista.querySelectorAll('[data-mais]').forEach(b => b.addEventListener('click', () => {
      const id = parseInt(b.dataset.mais, 10);
      const item = obterCarrinho().find(i => i.id === id);
      alterarQtdCarrinho(id, item.qtd + 1); render();
    }));
    lista.querySelectorAll('[data-menos]').forEach(b => b.addEventListener('click', () => {
      const id = parseInt(b.dataset.menos, 10);
      const item = obterCarrinho().find(i => i.id === id);
      if (item.qtd <= 1) { removerDoCarrinho(id); } else { alterarQtdCarrinho(id, item.qtd - 1); }
      render();
    }));
  }

  formasPagamento.addEventListener('change', render);

  btnFinalizar.addEventListener('click', async () => {
    const itens = obterCarrinho();
    if (itens.length === 0) return;
    const sessao = sessaoAtual();
    if (!sessao) {
      mensagem.className = 'form-error';
      mensagem.textContent = 'Faça login ou crie uma conta para finalizar o pedido.';
      mensagem.style.display = 'block';
      return;
    }
    const forma = formasPagamento.querySelector('input[name="pagamento"]:checked').value;
    if (forma === 'boleto') {
      mensagem.className = 'form-error';
      mensagem.textContent = 'O checkout online está configurado para cartão e PIX pelo Mercado Pago.';
      mensagem.style.display = 'block';
      return;
    }
    btnFinalizar.disabled = true;
    btnFinalizar.textContent = 'Preparando pagamento…';
    try {
      const resposta = await fetch('/api/checkout', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          items: itens.map(i => ({id:i.id, qtd:i.qtd})),
          payer: {nome:sessao.nome, email:sessao.email}, metodo:forma
        })
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.error || 'Não foi possível iniciar o pagamento.');
      if (!dados.init_point) throw new Error('O Mercado Pago não retornou o link de pagamento.');
      window.location.href = dados.init_point;
    } catch (erro) {
      mensagem.className = 'form-error';
      mensagem.textContent = erro.message;
      mensagem.style.display = 'block';
      btnFinalizar.disabled = false;
      btnFinalizar.textContent = 'Finalizar pedido';
    }
  });

  render();
}
document.addEventListener('DOMContentLoaded', () => quandoCatalogoPronto(iniciarPaginaCarrinho));
