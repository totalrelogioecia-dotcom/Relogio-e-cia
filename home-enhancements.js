/* =========================================================
   RELÓGIO E CIA — melhorias exclusivas da página inicial
   - Relógio sincronizado pela zona America/Sao_Paulo.
   - Mostruários expansíveis com carrossel de relógios por marca.
   - Produtos sem estoque permanecem visíveis, mas não podem ser adicionados.
   ========================================================= */
(() => {
  'use strict';

  if (!document.querySelector('link[href^="home-lighthouse-contrast.css"]')) {
    const contrastCss = document.createElement('link');
    contrastCss.rel = 'stylesheet';
    contrastCss.href = 'home-lighthouse-contrast.css?v=1';
    document.head.appendChild(contrastCss);
  }

  const TIME_ZONE = 'America/Sao_Paulo';

  function iniciarRelogioBrasilia() {
    const svg = document.getElementById('analog-clock-brasilia');
    if (!svg) return;

    const ticksGroup = document.getElementById('clock-ticks');
    const handHour = document.getElementById('hand-hour');
    const handMinute = document.getElementById('hand-minute');
    const handSecond = document.getElementById('hand-second');
    const dataEl = document.getElementById('stopwatch-data');
    if (!ticksGroup || !handHour || !handMinute || !handSecond) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
    const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: TIME_ZONE,
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    function partesHorario(data) {
      const parts = timeFormatter.formatToParts(data);
      const values = {};
      parts.forEach(part => {
        if (part.type !== 'literal') values[part.type] = part.value;
      });
      return {
        hora: Number(values.hour || 0),
        minuto: Number(values.minute || 0),
        segundo: Number(values.second || 0)
      };
    }

    function desenharIndices() {
      if (ticksGroup.childElementCount) return;
      const cx = 100;
      const cy = 100;
      const fragmento = document.createDocumentFragment();

      for (let i = 0; i < 60; i++) {
        const horaCheia = i % 5 === 0;
        const raioExterno = 90;
        const raioInterno = horaCheia ? 74 : 82;
        const angulo = i * 6 * (Math.PI / 180);
        const linha = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        linha.setAttribute('x1', (cx + raioInterno * Math.sin(angulo)).toFixed(2));
        linha.setAttribute('y1', (cy - raioInterno * Math.cos(angulo)).toFixed(2));
        linha.setAttribute('x2', (cx + raioExterno * Math.sin(angulo)).toFixed(2));
        linha.setAttribute('y2', (cy - raioExterno * Math.cos(angulo)).toFixed(2));
        linha.setAttribute('class', horaCheia ? 'tick-hour' : 'tick-minute');
        fragmento.appendChild(linha);
      }
      ticksGroup.appendChild(fragmento);
    }

    let ultimoSegundoTexto = -1;

    function atualizar() {
      const agora = new Date();
      const { hora, minuto, segundo } = partesHorario(agora);
      const segundoFracionado = segundo + agora.getMilliseconds() / 1000;
      const hora12 = hora % 12;

      handHour.style.transform = `rotate(${(hora12 + minuto / 60 + segundoFracionado / 3600) * 30}deg)`;
      handMinute.style.transform = `rotate(${(minuto + segundoFracionado / 60) * 6}deg)`;
      handSecond.style.transform = `rotate(${segundoFracionado * 6}deg)`;

      if (dataEl && segundo !== ultimoSegundoTexto) {
        ultimoSegundoTexto = segundo;
        let dataTexto = dateFormatter.format(agora);
        dataTexto = dataTexto.charAt(0).toUpperCase() + dataTexto.slice(1);
        const horaTexto = timeFormatter.format(agora);
        dataEl.textContent = `${horaTexto} · ${dataTexto} · Brasília`;
        svg.setAttribute('aria-label', `Relógio marcando ${horaTexto}, horário de Brasília`);
      }
    }

    desenharIndices();
    atualizar();

    if (reduceMotion) {
      window.setInterval(atualizar, 1000);
    } else {
      const loop = () => {
        atualizar();
        window.requestAnimationFrame(loop);
      };
      window.requestAnimationFrame(loop);
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function fotoProduto(produto) {
    if (Array.isArray(produto?.fotos) && produto.fotos.length) return String(produto.fotos[0] || '');
    return String(produto?.foto || '');
  }

  function ehRelogio(produto) {
    const categoria = String(produto?.categoria || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return categoria.includes('relog');
  }

  function produtoDisponivel(produto) {
    return produto?.ativo !== false && Number(produto?.estoque || 0) > 0;
  }

  function criarCardHome(produto, marca) {
    const foto = fotoProduto(produto);
    const urlProduto = `produto.html?id=${encodeURIComponent(produto.id)}`;
    const nome = escapeHtml(produto.nome || 'Relógio');
    const sku = escapeHtml(produto.sku || '');
    const disponivel = produtoDisponivel(produto);
    const preco = typeof formatarPreco === 'function'
      ? formatarPreco(Number(produto.preco || 0))
      : Number(produto.preco || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const acao = disponivel
      ? `<button class="btn btn-primary" type="button" data-home-add="${Number(produto.id)}">Adicionar</button>`
      : '<button class="btn btn-primary" type="button" disabled aria-disabled="true" title="Produto sem estoque">Indisponível</button>';

    return `
      <article class="home-watch-card" data-home-product="${Number(produto.id)}" data-stock="${Math.max(0, Number(produto.estoque) || 0)}">
        <a class="home-watch-photo" href="${urlProduto}" aria-label="Ver detalhes de ${nome}">
          ${foto
            ? `<img src="${escapeHtml(foto)}" alt="${nome}" loading="lazy" onerror="tratarErroFoto(this)">`
            : '<span class="card-photo-placeholder">Foto em breve</span>'}
        </a>
        <div class="home-watch-body">
          <span class="home-watch-ref">${sku ? `Ref. ${sku}` : escapeHtml(marca)}</span>
          <h3>${nome}</h3>
          <p class="home-watch-price">${preco}<small>5% de desconto no PIX</small></p>
          <div class="home-watch-actions">
            <a class="btn btn-outline" href="${urlProduto}">Ver detalhes</a>
            ${acao}
          </div>
        </div>
      </article>`;
  }

  function iniciarMostruariosMarcas() {
    const brandIndex = document.querySelector('#marcas .brand-index');
    if (!brandIndex || typeof quandoCatalogoPronto !== 'function') return;

    quandoCatalogoPronto(() => {
      const rows = Array.from(brandIndex.querySelectorAll('.brand-row'));
      let painelAberto = null;
      let rowAberta = null;

      function fecharAtual() {
        if (painelAberto) {
          painelAberto.classList.remove('is-open');
          painelAberto.setAttribute('aria-hidden', 'true');
        }
        if (rowAberta) {
          rowAberta.classList.remove('brand-row-open');
          rowAberta.setAttribute('aria-expanded', 'false');
        }
        painelAberto = null;
        rowAberta = null;
      }

      rows.forEach((row, index) => {
        const marca = new URL(row.href, window.location.href).searchParams.get('marca')
          || row.querySelector('.name')?.textContent?.trim()
          || '';
        const panelId = `brand-showcase-${index + 1}`;
        row.setAttribute('aria-expanded', 'false');
        row.setAttribute('aria-controls', panelId);
        row.setAttribute('title', `Mostrar relógios ${marca}`);

        const produtos = PRODUTOS.filter(produto =>
          produto?.ativo !== false
          && String(produto?.marca || '').toLowerCase() === marca.toLowerCase()
          && ehRelogio(produto)
        );

        const painel = document.createElement('div');
        painel.id = panelId;
        painel.className = 'brand-showcase';
        painel.setAttribute('aria-hidden', 'true');

        if (!produtos.length) {
          painel.innerHTML = `
            <div class="brand-showcase-empty">
              <span>Mostruário ${escapeHtml(marca)}</span>
              <p>Os relógios desta marca aparecerão aqui assim que estiverem disponíveis no catálogo.</p>
              <a class="btn btn-outline" href="produtos.html?marca=${encodeURIComponent(marca)}">Ver catálogo</a>
            </div>`;
        } else {
          painel.innerHTML = `
            <div class="brand-showcase-head">
              <div>
                <span class="brand-showcase-kicker">Seleção ${escapeHtml(marca)}</span>
                <strong>Modelos em destaque</strong>
              </div>
              <div class="brand-showcase-nav">
                <a href="produtos.html?marca=${encodeURIComponent(marca)}" class="brand-showcase-all">Ver todos</a>
                <button type="button" data-carousel-prev aria-label="Voltar no carrossel ${escapeHtml(marca)}">←</button>
                <button type="button" data-carousel-next aria-label="Avançar no carrossel ${escapeHtml(marca)}">→</button>
              </div>
            </div>
            <div class="brand-showcase-viewport">
              <div class="brand-showcase-track">
                ${produtos.map(produto => criarCardHome(produto, marca)).join('')}
              </div>
            </div>`;
        }

        row.insertAdjacentElement('afterend', painel);

        const viewport = painel.querySelector('.brand-showcase-viewport');
        painel.querySelector('[data-carousel-prev]')?.addEventListener('click', () => {
          viewport?.scrollBy({ left: -Math.max(280, viewport.clientWidth * 0.8), behavior: 'smooth' });
        });
        painel.querySelector('[data-carousel-next]')?.addEventListener('click', () => {
          viewport?.scrollBy({ left: Math.max(280, viewport.clientWidth * 0.8), behavior: 'smooth' });
        });

        painel.querySelectorAll('[data-home-add]').forEach(button => {
          button.addEventListener('click', () => {
            const id = Number(button.dataset.homeAdd);
            const produto = PRODUTOS.find(item => Number(item.id) === id);
            if (!Number.isFinite(id) || !produtoDisponivel(produto) || typeof adicionarAoCarrinho !== 'function') return;

            adicionarAoCarrinho(id);
            const original = button.textContent;
            button.textContent = 'Adicionado ✓';
            button.classList.add('is-added');
            window.setTimeout(() => {
              button.textContent = original;
              button.classList.remove('is-added');
            }, 1600);
          });
        });

        row.addEventListener('click', event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();

          const jaAberto = painel.classList.contains('is-open');
          fecharAtual();
          if (jaAberto) return;

          painel.classList.add('is-open');
          painel.setAttribute('aria-hidden', 'false');
          row.classList.add('brand-row-open');
          row.setAttribute('aria-expanded', 'true');
          painelAberto = painel;
          rowAberta = row;

          window.setTimeout(() => {
            const top = row.getBoundingClientRect().top;
            if (top < 80 || top > window.innerHeight * 0.75) {
              row.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 80);
        });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    iniciarRelogioBrasilia();
    iniciarMostruariosMarcas();
  });
})();
