/* =========================================================
   RELÓGIO E CIA — filtros técnicos do catálogo
   Filtra os dados antes da renderização progressiva do catálogo.
   Os filtros só são efetivados ao clicar em "Aplicar filtros".
   ========================================================= */
(function () {
  const DETAILS_URL = '/api/product-details';
  let detailsMap = {};

  function plain(value) {
    return String(value || '').trim();
  }

  function fold(value) {
    return plain(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function movementLabel(product, details) {
    const technical = fold(details?.movimento);

    /* A ficha técnica tem prioridade. Não usamos a palavra solta
       "automático" da descrição porque ela também aparece em frases
       como "calendário automático", o que não define o movimento. */
    if (technical) {
      if (/automatic[oa]?|mecan|self[ -]?winding/.test(technical)) return 'Automático';
      if (/quartz|quartzo|digital|solar|eco[ -]?drive|bateria|pilha/.test(technical)) return 'Quartz';
    }

    const name = fold(product?.nome);
    const description = fold(product?.desc);
    const fallback = `${name} ${description}`;

    if (/movimento\s+(automatic[oa]?|mecan)|relogio\s+(automatic[oa]?|mecan)|automatic\s+movement|mechanical\s+movement|self[ -]?winding/.test(fallback)) {
      return 'Automático';
    }

    if (/quartz|quartzo|digital|movimento\s+solar|eco[ -]?drive|bateria|pilha/.test(fallback)) {
      return 'Quartz';
    }

    /* Casio e G-Shock do catálogo atual são eletrônicos/quartz.
       Esta regra só entra quando a ficha técnica ainda não informa o tipo. */
    const brand = fold(product?.marca).replace(/\s+/g, '-');
    if (brand === 'casio' || brand === 'g-shock') return 'Quartz';

    return '';
  }

  function displayTypeLabel(product, details) {
    /* Anadigi/analógico/digital descreve a forma de exibição, não o mecanismo.
       Procuramos primeiro na ficha técnica e só depois em nome/descrição. */
    const technical = fold(`${details?.tipo_exibicao || ''} ${details?.movimento || ''}`);

    if (technical) {
      if (/anadigi|ana[ -]?digi|digital.{0,18}analog|analog.{0,18}digital/.test(technical)) return 'Anadigi';
      if (/\bdigital\b/.test(technical)) return 'Digital';
      if (/analog/.test(technical)) return 'Analógico';
    }

    const fallback = fold(`${product?.nome || ''} ${product?.desc || ''}`);
    if (/anadigi|ana[ -]?digi|digital.{0,18}analog|analog.{0,18}digital/.test(fallback)) return 'Anadigi';
    if (/\bdigital\b/.test(fallback)) return 'Digital';
    if (/analog/.test(fallback)) return 'Analógico';

    return '';
  }

  function colorLabels(value) {
    const raw = plain(value);
    const text = fold(raw);
    if (!text) return [];

    const labels = [];
    const add = label => {
      if (!labels.includes(label)) labels.push(label);
    };

    if (/preto|black/.test(text)) add('Preto');
    if (/branco|white/.test(text)) add('Branco');
    if (/prata|silver/.test(text)) add('Prata');

    /* Ouro rosé é tratado como Rosé, não como dourado comum. */
    const roseGold = /ouro\s*rose|rose\s*gold|\brose\b/.test(text);
    if (roseGold) add('Rosé');
    else if (/dourad|\bgold\b/.test(text)) add('Dourado');

    if (/azul|blue/.test(text)) add('Azul');
    if (/verde|green/.test(text)) add('Verde');
    if (/vermelh|\bred\b/.test(text)) add('Vermelho');
    if (/amarel|yellow/.test(text)) add('Amarelo');
    if (/laranj|orange/.test(text)) add('Laranja');
    if (/marrom|castanh|brown/.test(text)) add('Marrom');
    if (/cinza|grafite|gray|grey/.test(text)) add('Cinza');
    if (/bege|beige/.test(text)) add('Bege');
    if (/\brosa\b|pink/.test(text)) add('Rosa');
    if (/roxo|violeta|purple|violet/.test(text)) add('Roxo');

    /* Se a ficha usa uma cor não prevista, preservamos o texto cadastrado
       para não descartar informação real nem inventar uma classificação. */
    if (!labels.length) add(raw.length <= 28 ? raw : `${raw.slice(0, 25)}…`);
    return labels;
  }

  function materialLabel(value) {
    const raw = plain(value);
    const text = fold(raw);
    if (!text) return '';

    if (/carbon/.test(text) && /resin/.test(text)) return 'Carbono / Resina';
    if (/aco|steel|inox/.test(text)) return 'Aço inoxidável';
    if (/titan/.test(text)) return 'Titânio';
    if (/resin/.test(text)) return 'Resina';
    if (/couro|leather/.test(text)) return 'Couro';
    if (/silicone|silicon/.test(text)) return 'Silicone';
    if (/nylon|tecido|fabric/.test(text)) return 'Nylon / Tecido';
    if (/borracha|rubber/.test(text)) return 'Borracha';
    if (/metal/.test(text)) return 'Metal';

    return raw.length <= 34 ? raw : `${raw.slice(0, 31)}…`;
  }

  function productTechnical(product) {
    const details = detailsMap[String(product?.id)] || product?.detalhes || {};
    return {
      movimento: movementLabel(product, details),
      exibicao: displayTypeLabel(product, details),
      cores: colorLabels(details?.cor),
      caixa: materialLabel(details?.caixa_material),
      pulseira: materialLabel(details?.pulseira_material)
    };
  }

  function checkedValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(input => input.value);
  }

  function readFilters() {
    return {
      movimentos: checkedValues('movimento'),
      exibicoes: checkedValues('tipo-exibicao'),
      cores: checkedValues('cor'),
      caixas: checkedValues('caixa-material'),
      pulseiras: checkedValues('pulseira-material')
    };
  }

  function emptyFilters() {
    return { movimentos: [], exibicoes: [], cores: [], caixas: [], pulseiras: [] };
  }

  function matchesTechnical(product, filters = emptyFilters()) {
    const info = productTechnical(product);
    const okMovement = !filters.movimentos.length || filters.movimentos.includes(info.movimento);
    const okDisplay = !filters.exibicoes.length || filters.exibicoes.includes(info.exibicao);
    const okColor = !filters.cores.length || filters.cores.some(color => info.cores.includes(color));
    const okCase = !filters.caixas.length || filters.caixas.includes(info.caixa);
    const okStrap = !filters.pulseiras.length || filters.pulseiras.includes(info.pulseira);
    return okMovement && okDisplay && okColor && okCase && okStrap;
  }

  function resetInputs() {
    document.querySelectorAll(
      'input[name="movimento"], input[name="tipo-exibicao"], input[name="cor"], input[name="caixa-material"], input[name="pulseira-material"]'
    ).forEach(input => { input.checked = false; });
  }

  window.RelogioCatalogTechnical = {
    readFilters,
    matches: matchesTechnical,
    resetInputs,
    emptyFilters
  };

  function optionMarkup(name, value, count) {
    const safe = String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<label class="check-row"><input type="checkbox" name="${name}" value="${safe}"> ${safe} <span class="count">${count}</span></label>`;
  }

  function technicalCounts(kind) {
    const map = new Map();
    if (typeof PRODUTOS === 'undefined') return map;

    PRODUTOS
      .filter(product => product?.ativo !== false && String(product?.categoria || '') === 'Relógios')
      .forEach(product => {
        const rawValue = productTechnical(product)[kind];
        const values = Array.isArray(rawValue) ? rawValue : [rawValue];
        values.filter(Boolean).forEach(value => {
          map.set(value, (map.get(value) || 0) + 1);
        });
      });
    return map;
  }

  function renderMovementOptions() {
    const host = document.getElementById('filter-movement-options');
    if (!host) return;
    const counts = technicalCounts('movimento');
    host.innerHTML = [
      optionMarkup('movimento', 'Quartz', counts.get('Quartz') || 0),
      optionMarkup('movimento', 'Automático', counts.get('Automático') || 0)
    ].join('');
  }

  function renderDisplayOptions() {
    const host = document.getElementById('filter-display-options');
    if (!host) return;
    const counts = technicalCounts('exibicao');
    host.innerHTML = [
      optionMarkup('tipo-exibicao', 'Anadigi', counts.get('Anadigi') || 0),
      optionMarkup('tipo-exibicao', 'Digital', counts.get('Digital') || 0),
      optionMarkup('tipo-exibicao', 'Analógico', counts.get('Analógico') || 0)
    ].join('');
  }

  function renderColorOptions() {
    const host = document.getElementById('filter-color-options');
    if (!host) return;
    const counts = technicalCounts('cores');
    const preferred = ['Preto', 'Prata', 'Dourado', 'Rosé', 'Branco', 'Azul', 'Verde', 'Vermelho', 'Amarelo', 'Laranja', 'Cinza', 'Marrom', 'Bege', 'Rosa', 'Roxo'];
    const values = Array.from(counts.keys()).sort((a, b) => {
      const ai = preferred.indexOf(a);
      const bi = preferred.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b, 'pt-BR');
    });

    if (!values.length) {
      host.innerHTML = '<span class="filter-options-empty">Sem cores cadastradas na ficha técnica.</span>';
      return;
    }

    host.innerHTML = values.map(value => optionMarkup('cor', value, counts.get(value))).join('');
  }

  function renderMaterialOptions(hostId, inputName, kind) {
    const host = document.getElementById(hostId);
    if (!host) return;
    const counts = technicalCounts(kind);
    const values = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    if (!values.length) {
      host.innerHTML = '<span class="filter-options-empty">Sem materiais cadastrados na ficha técnica.</span>';
      return;
    }

    host.innerHTML = values.map(value => optionMarkup(inputName, value, counts.get(value))).join('');
  }

  async function loadDetails() {
    try {
      const response = await fetch(DETAILS_URL, { cache: 'no-store' });
      if (!response.ok) return {};
      const value = await response.json();
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  async function init() {
    if (!document.getElementById('product-grid')) return;

    detailsMap = await loadDetails();

    if (typeof quandoCatalogoPronto === 'function') {
      await quandoCatalogoPronto(() => {});
    }

    renderMovementOptions();
    renderDisplayOptions();
    renderColorOptions();
    renderMaterialOptions('filter-case-options', 'caixa-material', 'caixa');
    renderMaterialOptions('filter-strap-options', 'pulseira-material', 'pulseira');

    document.dispatchEvent(new CustomEvent('relogio:catalog-technical-ready'));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
