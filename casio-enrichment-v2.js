const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const BASE = 'https://www.casio.com/';
const SEARCH_READER = 'https://s.jina.ai/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const CATALOG_FILE = path.join(__dirname, 'data', 'casio-official-catalog.json');
const PRODUCTS_FILE = path.join(DATA, 'products.json');
const memoryCache = new Map();
let catalogSnapshot = { mtimeMs: -1, products: {} };

function cleanSku(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 40);
}

function variants(raw) {
  const clean = cleanSku(raw);
  if (!clean) return [];
  const out = [clean];
  for (const suffix of ['DR', 'BR', 'CF', 'CR', 'ER', 'JF', 'DF']) {
    if (clean.endsWith(suffix) && clean.length > suffix.length + 3) out.push(clean.slice(0, -suffix.length));
  }
  return [...new Set(out)];
}

function decode(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/');
}

function plain(content) {
  return decode(String(content || ''))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li|h\d|tr|td|th|dt|dd)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/[\t\r]+/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function blockedContent(content) {
  const text = plain(content).toLowerCase();
  if (!text) return true;
  return [
    'access denied',
    'request blocked',
    'the requested url was rejected',
    "you don't have permission to access",
    'you do not have permission to access',
    'forbidden',
    'reference #',
    'akamai',
    'security service to protect'
  ].some(term => text.includes(term));
}

function containsSku(content, sku) {
  if (blockedContent(content)) return false;
  const compactText = plain(content).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const compactSku = cleanSku(sku).replace(/[^A-Z0-9]/g, '');
  return Boolean(compactSku && compactText.includes(compactSku));
}

function readCatalog() {
  try {
    const stat = fs.statSync(CATALOG_FILE);
    if (catalogSnapshot.mtimeMs === stat.mtimeMs) return catalogSnapshot.products;
    const parsed = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
    const products = parsed && typeof parsed.products === 'object' ? parsed.products : {};
    catalogSnapshot = { mtimeMs: stat.mtimeMs, products };
    return products;
  } catch {
    return catalogSnapshot.products || {};
  }
}

function readStoreProducts() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function fromLocalCatalog(raw) {
  const catalog = readCatalog();
  for (const sku of variants(raw)) {
    const item = catalog[sku];
    if (!item) continue;
    return {
      ...item,
      sku: cleanSku(item.sku || sku),
      origem: item.origem || 'Catálogo oficial Casio sincronizado',
      modo: 'catalogo-local'
    };
  }
  return null;
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function storeProductBySku(products) {
  const map = new Map();
  for (const product of products) {
    const sku = cleanSku(product?.sku);
    if (sku && !map.has(sku)) map.set(sku, product);
  }
  return map;
}

function catalogStatus(product) {
  if (!product) return 'base';
  if (product.ativo === false) return 'oculto';
  if (Number(product.estoque) > 0) return 'em_estoque';
  return 'sem_estoque';
}

function catalogList(req, res) {
  const query = normalizeSearch(req.query?.q).slice(0, 80);
  const requestedStatus = String(req.query?.status || 'todos').trim().toLowerCase();
  const allowedStatus = new Set(['todos', 'base', 'em_estoque', 'sem_estoque', 'oculto']);
  const filterStatus = allowedStatus.has(requestedStatus) ? requestedStatus : 'todos';
  const limit = Math.min(50, Math.max(1, Number(req.query?.limit) || 30));
  const offset = Math.max(0, Number(req.query?.offset) || 0);

  const catalog = readCatalog();
  const storeProducts = readStoreProducts();
  const storeMap = storeProductBySku(storeProducts);
  const catalogEntries = Object.entries(catalog);

  const rows = catalogEntries.map(([key, item]) => {
    const sku = cleanSku(item?.sku || key);
    const product = storeMap.get(sku) || null;
    const status = catalogStatus(product);
    const nome = String(item?.nome || product?.nome || sku).trim();
    const marca = String(item?.marca || product?.marca || '').trim();
    const searchable = normalizeSearch(`${sku} ${nome} ${marca}`);
    let score = 0;
    if (query) {
      const compactQuery = query.replace(/\s+/g, '');
      const compactSku = sku.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (compactSku === compactQuery) score += 1000;
      else if (compactSku.startsWith(compactQuery)) score += 500;
      else if (compactSku.includes(compactQuery)) score += 300;
      if (normalizeSearch(nome).startsWith(query)) score += 120;
      if (searchable.includes(query)) score += 60;
    }
    return {
      sku,
      nome,
      marca,
      foto: Array.isArray(item?.fotos) ? String(item.fotos[0] || '') : '',
      status,
      estoque: Math.max(0, Number(product?.estoque) || 0),
      ativo: product ? product.ativo !== false : false,
      product_id: product?.id ?? null,
      searchable,
      score
    };
  }).filter(row => (!query || row.searchable.includes(query) || row.sku.toLowerCase().replace(/[^a-z0-9]/g, '').includes(query.replace(/\s+/g, '')))
    && (filterStatus === 'todos' || row.status === filterStatus));

  rows.sort((a, b) => b.score - a.score || a.marca.localeCompare(b.marca, 'pt-BR') || a.sku.localeCompare(b.sku, 'pt-BR'));
  const total = rows.length;
  const items = rows.slice(offset, offset + limit).map(({ searchable, score, ...row }) => row);

  res.set('Cache-Control', 'no-store');
  res.json({
    items,
    total,
    limit,
    offset,
    counts: {
      catalogo: catalogEntries.length,
      loja: storeProducts.length
    }
  });
}

function catalogDetail(req, res) {
  const requested = cleanSku(req.params?.sku);
  const catalog = readCatalog();
  let item = null;
  let foundSku = '';
  for (const sku of variants(requested)) {
    if (catalog[sku]) {
      item = catalog[sku];
      foundSku = sku;
      break;
    }
  }
  if (!item) return res.status(404).json({ error: 'Modelo não encontrado no catálogo base.' });

  const storeProducts = readStoreProducts();
  const product = storeProductBySku(storeProducts).get(cleanSku(item.sku || foundSku)) || null;
  res.set('Cache-Control', 'no-store');
  res.json({
    item: {
      ...item,
      sku: cleanSku(item.sku || foundSku),
      modo: 'catalogo-local'
    },
    product: product ? {
      id: product.id,
      sku: product.sku,
      nome: product.nome,
      estoque: Math.max(0, Number(product.estoque) || 0),
      ativo: product.ativo !== false
    } : null
  });
}

function pick(text, labels, max = 500) {
  const lines = plain(text).split('\n').map(line => line.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i].replace(/^#+\s*/, '').trim();
    for (const label of labels) {
      const lower = current.toLocaleLowerCase('pt-BR');
      const target = label.toLocaleLowerCase('pt-BR');
      if (lower !== target && !lower.startsWith(target + ':')) continue;
      let value = current.slice(label.length).replace(/^\s*[:：-]\s*/, '').trim();
      if (!value) value = String(lines[i + 1] || '').replace(/^#+\s*/, '').trim();
      if (value && value.length <= max) return value;
    }
  }
  return '';
}

function displayType(content) {
  const text = plain(content).toUpperCase();
  if (/DIGITAL\s*[-+/ ]\s*ANAL[ÓO]GICO|ANAL[ÓO]GICO\s*[-+/ ]\s*DIGITAL/.test(text)) return 'Digital + analógico';
  if (/\bDIGITAL\b/.test(text) && /\bANAL[ÓO]GICO\b/.test(text)) return 'Digital + analógico';
  if (/\bDIGITAL\b/.test(text)) return 'Digital';
  if (/\bANAL[ÓO]GICO\b/.test(text)) return 'Analógico';
  return '';
}

function specs(content) {
  const details = {
    movimento: pick(content, ['Movimento', 'Movement']) || displayType(content),
    caixa_material: pick(content, ['Material da caixa e da moldura', 'Material da caixa e do bisel', 'Material da caixa', 'Case and bezel material', 'Case material']),
    pulseira_material: pick(content, ['Pulseira', 'Bracelete', 'Band', 'Material da pulseira']),
    cor: pick(content, ['Cor', 'Color', 'Cor da pulseira', 'Band color']),
    diametro: pick(content, ['Tamanho do Relógio (Caixa|Visor) C x L x A', 'Tamanho do Relógio', 'Tamanho da caixa (C × L × A)', 'Tamanho da caixa', 'Case size (L× W× H)', 'Case size']),
    resistencia_agua: pick(content, ['Resistente a água', 'Resistência à água', 'Resistência à água de', 'Water resistance']),
    vidro: pick(content, ['Vidro', 'Glass'])
  };
  return Object.fromEntries(Object.entries(details).filter(([, value]) => String(value || '').trim()));
}

function absoluteImage(raw) {
  try {
    const url = new URL(decode(raw).trim(), BASE);
    return url.protocol === 'https:' && url.hostname === 'www.casio.com' && url.pathname.startsWith('/content/dam/casio/') ? url.toString() : '';
  } catch {
    return '';
  }
}

function images(content, sku, max = 6) {
  const found = [];
  const patterns = [
    /https:\/\/www\.casio\.com\/content\/dam\/casio\/[^\s"'<>\])]+/gi,
    /\/content\/dam\/casio\/[^\s"'<>\])]+/gi
  ];
  for (const re of patterns) {
    for (const raw of String(content || '').match(re) || []) {
      const url = absoluteImage(raw.replace(/[\])},;]+$/g, ''));
      if (url && !found.includes(url)) found.push(url);
    }
  }
  const compact = cleanSku(sku).toLowerCase().replace(/[^a-z0-9]/g, '');
  const score = value => {
    const lower = value.toLowerCase();
    const normalized = lower.replace(/[^a-z0-9]/g, '');
    let points = normalized.includes(compact) ? 180 : 0;
    if (/seq0?1|seq0?2|seq0?3|main-visual|assets/.test(lower)) points += 30;
    if (/icon|logo|banner|manual|qr|feature/.test(lower)) points -= 150;
    return points;
  };
  return found.sort((a, b) => score(b) - score(a)).filter(value => score(value) > 0).slice(0, max);
}

function description(content) {
  const lines = plain(content).split('\n').map(line => line.trim()).filter(Boolean);
  const useful = lines.find(line => line.length > 45 && line.length < 700 && /resistente|cron[oô]metro|alarme|bluetooth|solar|digital|anal[oó]gico|estrutura|design/i.test(line));
  return String(useful || '').slice(0, 900);
}

function resultFromContent(content, sku, url, brand, origin) {
  if (!containsSku(content, sku)) return null;
  const lines = plain(content).split('\n').map(line => line.trim()).filter(Boolean);
  const skuLine = lines.find(line => line.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(cleanSku(sku).replace(/[^A-Z0-9]/g, '')) && line.length < 140);
  const nome = skuLine && !/access denied|forbidden/i.test(skuLine)
    ? (skuLine.toUpperCase() === cleanSku(sku) ? `${brand} ${cleanSku(sku)}` : skuLine)
    : `${brand} ${cleanSku(sku)}`;

  return {
    sku: cleanSku(sku),
    nome,
    marca: brand,
    categoria: 'Relógios',
    desc: description(content),
    fotos: images(content, sku, 6),
    detalhes: specs(content),
    fonte: url,
    origem: origin,
    modo: 'consulta-oficial'
  };
}

async function fetchTimed(url, timeout, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
        ...headers
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function searchIndexed(sku) {
  try {
    const query = encodeURIComponent(`${cleanSku(sku)} CASIO`);
    const response = await fetchTimed(`${SEARCH_READER}${query}?site=casio.com`, 5500, {
      Accept: 'application/json',
      'x-cache-tolerance': '86400'
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    const list = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);
    for (const item of list) {
      const url = String(item?.url || '').trim();
      const content = String(item?.content || item?.description || '').trim();
      if (!url || !containsSku(content, sku)) continue;
      try {
        const parsed = new URL(url);
        if (!/(^|\.)casio\.com$/i.test(parsed.hostname)) continue;
        if (!decodeURIComponent(parsed.pathname).toUpperCase().replace(/-/g, '').includes(`PRODUCT.${cleanSku(sku).replace(/-/g, '')}`)) continue;
        const brand = /\/gshock\//i.test(parsed.pathname) ? 'G-Shock' : 'Casio';
        const origin = /\/br\//i.test(parsed.pathname) ? (brand === 'G-Shock' ? 'Casio Brasil — G-Shock' : 'Casio Brasil') : 'Casio oficial';
        const result = resultFromContent(content, sku, url, brand, origin);
        if (result) return result;
      } catch {}
    }
  } catch {}
  return null;
}

async function directBrazil(sku) {
  const urls = [
    { brand: 'Casio', url: `https://www.casio.com/br/watches/casio/product.${encodeURIComponent(sku)}/`, origin: 'Casio Brasil' },
    { brand: 'G-Shock', url: `https://www.casio.com/br/watches/gshock/product.${encodeURIComponent(sku)}/`, origin: 'Casio Brasil — G-Shock' }
  ];

  const results = await Promise.all(urls.map(async item => {
    try {
      const response = await fetchTimed(item.url, 4200, { Accept: 'text/html,application/xhtml+xml' });
      if (!response.ok) return null;
      const content = await response.text();
      return resultFromContent(content, sku, response.url || item.url, item.brand, item.origin);
    } catch {
      return null;
    }
  }));
  return results.find(Boolean) || null;
}

async function enrich(raw) {
  const requested = cleanSku(raw);
  if (!requested) throw Object.assign(new Error('Informe uma referência Casio ou G-Shock.'), { statusCode: 400 });

  const local = fromLocalCatalog(requested);
  if (local) return local;
  if (memoryCache.has(requested)) return memoryCache.get(requested);

  for (const sku of variants(requested)) {
    const indexed = await searchIndexed(sku);
    if (indexed) {
      memoryCache.set(requested, indexed);
      return indexed;
    }

    const direct = await directBrazil(sku);
    if (direct) {
      memoryCache.set(requested, direct);
      return direct;
    }
  }

  throw Object.assign(
    new Error(`A referência ${requested} ainda não está no catálogo local e a Casio bloqueou a consulta ao vivo. Tente novamente mais tarde ou sincronize o catálogo oficial.`),
    { statusCode: 503 }
  );
}

function handler(req, res) {
  enrich(req.query?.sku)
    .then(data => {
      res.set('Cache-Control', 'no-store');
      res.json(data);
    })
    .catch(error => res.status(Number(error?.statusCode) || 502).json({
      error: error.message || 'Não foi possível consultar a Casio/G-Shock.'
    }));
}

function registerCasioEnrichmentV2(app) {
  app.get('/api/admin/catalog-base', catalogList);
  app.get('/api/admin/catalog-base/:sku', catalogDetail);
  app.get('/api/admin/casio-enrichment', handler);
  app.get('/api/casio-enrichment', handler);
  app.get('/api/product-enrichment', handler);
}

module.exports = { registerCasioEnrichmentV2 };
