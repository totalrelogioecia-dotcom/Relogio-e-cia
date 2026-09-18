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
  const nomeCompleto = String(sessao?.nome || '').trim();
  const primeiroNome = nomeCompleto.split(/\s+/)[0] || 'Conta';
  const label = document.createElement('span');
  label.className = 'nav-account-label';
  label.textContent = primeiroNome;
  link.replaceChildren(label);
  link.title = nomeCompleto ? `Conta de ${nomeCompleto}` : 'Conta';
  link.setAttribute('aria-label', nomeCompleto ? `Conta de ${nomeCompleto}` : 'Conta');
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
let PRODUTOS = []; // Apenas a API oficial preenche o catálogo.

/* ---------- Carregamento do catálogo pelo backend ---------- */
let catalogoCarregamento = null;
let catalogoErro = null;
const catalogoCallbacks = new Set();

function tentarCatalogoNovamente() {
  catalogoCarregamento = null;
  catalogoErro = null;
  catalogoCallbacks.forEach(callback => quandoCatalogoPronto(callback));
}

function mostrarErroCatalogo() {
  ['product-grid', 'home-selection-grid', 'cart-list'].forEach(id => {
    const host = document.getElementById(id);
    if (host) window.RelogioUI.error(host, 'Não foi possível carregar os produtos. Nenhuma disponibilidade pode ser confirmada agora.', tentarCatalogoNovamente);
  });
  const count = document.getElementById('result-count');
  if (count) count.textContent = 'Catálogo temporariamente indisponível';
}

function quandoCatalogoPronto(callback) {
  catalogoCallbacks.add(callback);
  if (!catalogoCarregamento) {
    catalogoErro = null;
    ['product-grid', 'home-selection-grid', 'cart-list'].forEach(id => window.RelogioUI.loading(document.getElementById(id), 'Carregando produtos…'));
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
        PRODUTOS = produtos;
        ['product-grid', 'home-selection-grid', 'cart-list'].forEach(id => window.RelogioUI.ready(document.getElementById(id)));
        return PRODUTOS;
      })
      .catch(err => {
        // Nunca anuncia preço ou disponibilidade de um catálogo antigo após falha.
        console.error('Não foi possível carregar o catálogo do servidor:', err);
        catalogoErro = err;
        PRODUTOS = [];
        mostrarErroCatalogo();
        return PRODUTOS;
      });
  }
  return catalogoCarregamento.then(() => { if (!catalogoErro) return callback(); });
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
