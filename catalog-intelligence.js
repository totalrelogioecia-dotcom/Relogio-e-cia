(() => {
  'use strict';

  const normalize = value => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-‐‑‒–—−]/g, ' ')
    .replace(/[^a-z0-9.%+\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

  const numberFrom = value => {
    const match = String(value ?? '').replace(/\./g, '').replace(',', '.').match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  };

  function levenshtein(a, b) {
    a = normalize(a); b = normalize(b);
    if (!a) return b.length;
    if (!b) return a.length;
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      let prev = row[0]; row[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const old = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = old;
      }
    }
    return row[b.length];
  }

  const MOVEMENTS = [
    ['automatico', ['automatico', 'automático', 'automatic']],
    ['solar', ['solar', 'eco drive', 'ecodrive']],
    ['quartz', ['quartz', 'quartzo']],
    ['digital', ['digital']],
    ['mecanico', ['mecanico', 'mecânico']]
  ];
  const COLORS = [
    ['preto', ['preto', 'black']], ['azul', ['azul', 'blue']], ['verde', ['verde', 'green']],
    ['vermelho', ['vermelho', 'red']], ['dourado', ['dourado', 'gold']], ['prata', ['prata', 'silver']],
    ['branco', ['branco', 'white']], ['cinza', ['cinza', 'grey', 'gray']], ['marrom', ['marrom', 'brown']]
  ];
  const STYLE_TERMS = {
    esportivo: ['esportivo', 'sport', 'treino', 'academia'],
    social: ['social', 'elegante', 'classico', 'clássico'],
    mergulho: ['mergulho', 'diver', 'mergulhador'],
    casual: ['casual', 'dia a dia', 'diario', 'diário']
  };

  function detailsText(details = {}) {
    return normalize(Object.values(details || {}).filter(value => typeof value === 'string' || typeof value === 'number').join(' '));
  }

  function documentFor(product, details = {}) {
    return normalize([
      product?.nome, product?.sku, product?.marca, product?.categoria, product?.desc,
      detailsText(details)
    ].filter(Boolean).join(' '));
  }

  function parseQuery(raw) {
    const original = String(raw || '').trim();
    const q = normalize(original);
    const filters = { maxPrice: null, minPrice: null, movement: null, color: null, waterResistance: null, styles: [] };

    const maxMatch = original.match(/(?:ate|até|max(?:imo)?|menos de)\s*(?:r\$\s*)?([\d.]+(?:,\d+)?)/i);
    const minMatch = original.match(/(?:acima de|mais de|min(?:imo)?|a partir de)\s*(?:r\$\s*)?([\d.]+(?:,\d+)?)/i);
    if (maxMatch) filters.maxPrice = numberFrom(maxMatch[1]);
    if (minMatch) filters.minPrice = numberFrom(minMatch[1]);

    for (const [movement, aliases] of MOVEMENTS) {
      if (aliases.some(alias => q.includes(normalize(alias)))) { filters.movement = movement; break; }
    }
    for (const [color, aliases] of COLORS) {
      if (aliases.some(alias => q.includes(normalize(alias)))) { filters.color = color; break; }
    }
    const water = original.match(/(\d{2,4})\s*m(?:etros?)?\b/i);
    if (water) filters.waterResistance = Number(water[1]);
    for (const [style, aliases] of Object.entries(STYLE_TERMS)) {
      if (aliases.some(alias => q.includes(normalize(alias)))) filters.styles.push(style);
    }

    const stop = new Set(['relogio','relógio','relogios','relógios','de','da','do','com','para','ate','até','r','rs','mais','menos','maximo','minimo','max','min']);
    const tokens = q.split(/\s+/).filter(token => token.length > 1 && !stop.has(token) && !/^\d+(?:\.\d+)?$/.test(token));
    return { original, normalized: q, filters, tokens };
  }

  function movementMatches(doc, movement) {
    if (!movement) return true;
    const aliases = MOVEMENTS.find(([key]) => key === movement)?.[1] || [movement];
    return aliases.some(alias => doc.includes(normalize(alias)));
  }

  function colorMatches(doc, color) {
    if (!color) return true;
    const aliases = COLORS.find(([key]) => key === color)?.[1] || [color];
    return aliases.some(alias => doc.includes(normalize(alias)));
  }

  function waterResistanceValue(details = {}) {
    const raw = [details.resistencia_agua, details.resistente_agua, details.water_resistance].filter(Boolean).join(' ');
    const match = String(raw).match(/(\d{2,4})\s*m/i);
    return match ? Number(match[1]) : null;
  }

  function fuzzyTokenScore(token, words) {
    if (words.some(word => word === token)) return 10;
    if (words.some(word => word.startsWith(token) || token.startsWith(word))) return 7;
    if (token.length >= 4 && words.some(word => Math.abs(word.length - token.length) <= 2 && levenshtein(word, token) <= 1)) return 5;
    return 0;
  }

  function scoreProduct(product, details, query) {
    const parsed = typeof query === 'string' ? parseQuery(query) : query;
    if (!parsed?.normalized) return { score: 0, reasons: [] };
    const doc = documentFor(product, details);
    const words = doc.split(/\s+/).filter(Boolean);
    const name = normalize(product?.nome);
    const sku = normalize(product?.sku).replace(/\s/g, '');
    const brand = normalize(product?.marca);
    const qCompact = parsed.normalized.replace(/\s/g, '');
    const price = Number(product?.preco || 0);

    if (parsed.filters.maxPrice != null && price > parsed.filters.maxPrice) return { score: 0, reasons: [] };
    if (parsed.filters.minPrice != null && price < parsed.filters.minPrice) return { score: 0, reasons: [] };
    if (!movementMatches(doc, parsed.filters.movement)) return { score: 0, reasons: [] };
    if (!colorMatches(doc, parsed.filters.color)) return { score: 0, reasons: [] };
    if (parsed.filters.waterResistance != null) {
      const wr = waterResistanceValue(details);
      if (wr == null || wr < parsed.filters.waterResistance) return { score: 0, reasons: [] };
    }

    let score = 0;
    const reasons = [];
    if (sku && sku === qCompact) { score += 120; reasons.push('referência exata'); }
    if (name === parsed.normalized) { score += 100; reasons.push('nome exato'); }
    if (sku && sku.includes(qCompact) && qCompact.length >= 3) score += 65;
    if (name.includes(parsed.normalized)) score += 55;
    if (brand && parsed.normalized.includes(brand)) { score += 28; reasons.push(`marca ${product.marca}`); }

    let tokenHits = 0;
    for (const token of parsed.tokens) {
      const tokenScore = fuzzyTokenScore(token, words);
      if (tokenScore) { score += tokenScore; tokenHits += 1; }
    }
    if (parsed.tokens.length && tokenHits === parsed.tokens.length) score += 22;
    if (parsed.filters.maxPrice != null || parsed.filters.minPrice != null) reasons.push('faixa de preço');
    if (parsed.filters.movement) { score += 18; reasons.push(parsed.filters.movement); }
    if (parsed.filters.color) { score += 12; reasons.push(parsed.filters.color); }
    if (parsed.filters.waterResistance != null) { score += 18; reasons.push(`${parsed.filters.waterResistance} m ou mais`); }

    return { score, reasons: [...new Set(reasons)].slice(0, 3) };
  }

  function similarity(current, candidate, detailsMap = {}) {
    if (!current || !candidate || Number(current.id) === Number(candidate.id)) return { score: -1, reasons: [] };
    const a = detailsMap[String(current.id)] || current.detalhes || {};
    const b = detailsMap[String(candidate.id)] || candidate.detalhes || {};
    let score = 0;
    const reasons = [];
    if (normalize(current.marca) === normalize(candidate.marca)) { score += 22; reasons.push('mesma marca'); }
    if (normalize(current.categoria) === normalize(candidate.categoria)) score += 10;
    const priceA = Number(current.preco || 0), priceB = Number(candidate.preco || 0);
    if (priceA > 0 && priceB > 0) {
      const ratio = Math.abs(priceA - priceB) / Math.max(priceA, priceB);
      if (ratio <= .15) { score += 18; reasons.push('faixa de preço próxima'); }
      else if (ratio <= .3) score += 10;
    }
    const pairs = [
      ['movimento', 'mesmo movimento'], ['resistencia_agua', 'resistência à água semelhante'],
      ['vidro', 'mesmo tipo de vidro'], ['caixa_material', 'material de caixa semelhante'],
      ['pulseira_material', 'material de pulseira semelhante'], ['cor', 'cor semelhante']
    ];
    for (const [key, reason] of pairs) {
      if (a[key] && b[key] && normalize(a[key]) === normalize(b[key])) { score += 13; reasons.push(reason); }
    }
    if (Number(candidate.estoque || 0) > 0) score += 4;
    return { score, reasons: [...new Set(reasons)].slice(0, 3) };
  }

  function recommend(current, products, detailsMap = {}, limit = 4) {
    return (Array.isArray(products) ? products : [])
      .filter(product => product?.ativo !== false && Number(product.id) !== Number(current?.id))
      .map(product => ({ product, ...similarity(current, product, detailsMap) }))
      .filter(item => item.score >= 0)
      .sort((a, b) => b.score - a.score || Number(b.product.estoque || 0) - Number(a.product.estoque || 0))
      .slice(0, limit);
  }

  window.RelogioCatalogIntelligence = { normalize, parseQuery, scoreProduct, similarity, recommend, documentFor, waterResistanceValue };
})();
