const { URL } = require('url');

const BASE = 'https://www.casio.com/';
const READER = 'https://r.jina.ai/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
const cache = new Map();

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
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[\t\r]+/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function extractMeta(html, key, attr = 'name') {
  const safe = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${safe}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${safe}["']`, 'i')
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) return decode(match[1]).replace(/\s+/g, ' ').trim();
  }
  return '';
}

function extractTitle(content, sku) {
  const html = String(content || '');
  for (const re of [/<h1[^>]*>([\s\S]*?)<\/h1>/i, /<title[^>]*>([\s\S]*?)<\/title>/i, /^#\s+(.+)$/m, /^Title:\s*(.+)$/mi]) {
    const match = html.match(re);
    if (!match) continue;
    const value = decode(match[1])
      .replace(/<[^>]+>/g, ' ')
      .replace(/[*#]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*\|\s*CASIO.*$/i, '')
      .trim();
    if (value && value.toUpperCase().includes(sku)) return value;
  }
  return extractMeta(html, 'og:title', 'property').replace(/\s*\|\s*CASIO.*$/i, '').trim() || sku;
}

function productName(content, sku, brand) {
  const title = extractTitle(content, sku).replace(/\s+/g, ' ').trim();
  const compactTitle = title.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const compactSku = sku.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!title || compactTitle === compactSku || compactTitle === `${brand.toUpperCase().replace(/[^A-Z0-9]/g, '')}${compactSku}`) {
    return `${brand} ${sku}`;
  }
  return title.slice(0, 140);
}

function pick(text, labels, max = 320) {
  const lines = String(text || '').split('\n').map(x => x.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    for (const label of labels) {
      const safe = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = lines[i].match(new RegExp(`^${safe}\\s*[:：]?\\s*(.*)$`, 'i'));
      if (!match) continue;
      let value = String(match[1] || '').trim();
      if (!value && lines[i + 1]) value = lines[i + 1].trim();
      if (value && value.length <= max) return value;
    }
  }
  return '';
}

function displayType(content) {
  const lines = plain(content).split('\n').map(x => x.trim()).filter(Boolean).slice(0, 120);
  for (const line of lines) {
    const clean = line.toUpperCase().replace(/\s+/g, ' ').trim();
    if (/^(DIGITAL[- /+]ANAL[ÓO]GICO|ANAL[ÓO]GICO[- /+]DIGITAL)$/.test(clean)) return 'Digital + analógico';
    if (clean === 'DIGITAL') return 'Digital';
    if (/^ANAL[ÓO]GICO$/.test(clean)) return 'Analógico';
  }
  return '';
}

function specs(content) {
  const text = plain(content);
  const details = {
    movimento: pick(text, ['Movimento', 'Movement']) || displayType(content),
    caixa_material: pick(text, ['Material da caixa e da moldura', 'Material da caixa e do bisel', 'Material da caixa', 'Case and bezel material', 'Case material']),
    pulseira_material: pick(text, ['Pulseira', 'Bracelete', 'Band', 'Material da pulseira']),
    cor: pick(text, ['Cor', 'Color', 'Cor da pulseira', 'Band color']),
    diametro: pick(text, ['Tamanho do Relógio (Caixa|Visor) C x L x A', 'Tamanho do Relógio', 'Tamanho da caixa (C × L × A)', 'Tamanho da caixa', 'Case size (L× W× H)', 'Case size']),
    resistencia_agua: pick(text, ['Resistente a água', 'Resistência à água', 'Resistência à água de', 'Water resistance']),
    vidro: pick(text, ['Vidro', 'Glass'])
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
  const normalized = decode(content);
  const patterns = [
    /https:\/\/www\.casio\.com\/content\/dam\/casio\/[^\s"'<>]+/gi,
    /\/content\/dam\/casio\/[^\s"'<>]+/gi
  ];

  for (const re of patterns) {
    for (const raw of normalized.match(re) || []) {
      const cleaned = raw.replace(/[\])},;]+$/g, '');
      const url = absoluteImage(cleaned);
      if (url && !found.includes(url) && /\.(?:png|jpe?g|webp)(?:\.|\?|$)/i.test(url)) found.push(url);
    }
  }

  const compact = sku.toLowerCase().replace(/-/g, '');
  const score = url => {
    const lower = url.toLowerCase();
    const compactUrl = lower.replace(/-/g, '');
    let value = 0;
    if (lower.includes(sku.toLowerCase())) value += 120;
    if (compactUrl.includes(compact)) value += 90;
    if (/assets|main-visual|seq1|seq2|seq3|_01|_02|_03/.test(lower)) value += 20;
    if (/icon|logo|banner|payment|feature|size|scene|manual|qr/.test(lower)) value -= 100;
    return value;
  };

  return found.sort((a, b) => score(b) - score(a)).filter(url => score(url) > 0).slice(0, max);
}

async function fetchTimed(url, timeout = 8000, headers = {}) {
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

function candidates(sku) {
  // Prioriza o catálogo brasileiro. Os demais endereços também pertencem à Casio
  // e servem apenas como fallback quando uma referência ainda não está publicada no Brasil.
  return [
    { brand: 'Casio', region: 'Brasil', url: `https://www.casio.com/br/watches/casio/product.${encodeURIComponent(sku)}/` },
    { brand: 'G-Shock', region: 'Brasil', url: `https://www.casio.com/br/watches/gshock/product.${encodeURIComponent(sku)}/` },
    { brand: 'Casio', region: 'Portugal', url: `https://www.casio.com/pt/watches/casio/product.${encodeURIComponent(sku)}/` },
    { brand: 'G-Shock', region: 'Portugal', url: `https://www.casio.com/pt/watches/gshock/product.${encodeURIComponent(sku)}/` },
    { brand: 'Casio', region: 'América Latina', url: `https://www.casio.com/latin/watches/casio/product.${encodeURIComponent(sku)}/` },
    { brand: 'G-Shock', region: 'América Latina', url: `https://www.casio.com/latin/watches/gshock/product.${encodeURIComponent(sku)}/` },
    { brand: 'Casio', region: 'Internacional', url: `https://www.casio.com/intl/watches/casio/product.${encodeURIComponent(sku)}/` },
    { brand: 'G-Shock', region: 'Internacional', url: `https://www.casio.com/intl/watches/gshock/product.${encodeURIComponent(sku)}/` }
  ];
}

function containsSku(content, sku) {
  const text = plain(content).toUpperCase();
  return text.includes(sku) || text.replace(/-/g, '').includes(sku.replace(/-/g, ''));
}

function urlMatchesSku(url, sku) {
  try {
    const pathname = decodeURIComponent(new URL(url).pathname).toUpperCase();
    return pathname.includes(`PRODUCT.${sku}`) || pathname.replace(/-/g, '').includes(`PRODUCT.${sku.replace(/-/g, '')}`);
  } catch {
    return false;
  }
}

async function directPage(candidate, sku) {
  try {
    const response = await fetchTimed(candidate.url, 8500, {
      Accept: 'text/html,application/xhtml+xml',
      'Cache-Control': 'no-cache'
    });
    if (!response.ok) return null;
    const content = await response.text();
    const finalUrl = response.url || candidate.url;
    if (!containsSku(content, sku) && !urlMatchesSku(finalUrl, sku) && !urlMatchesSku(candidate.url, sku)) return null;
    return { ...candidate, content, finalUrl, via: 'direct' };
  } catch {
    return null;
  }
}

async function readerPage(candidate, sku) {
  try {
    // Fallback de leitura da mesma URL oficial quando a página da Casio entrega
    // somente o esqueleto JavaScript ao servidor. A fonte exibida continua sendo a URL oficial.
    const response = await fetchTimed(`${READER}${candidate.url}`, 14000, { Accept: 'text/plain' });
    if (!response.ok) return null;
    const content = await response.text();
    if (!containsSku(content, sku) && !urlMatchesSku(candidate.url, sku)) return null;
    return { ...candidate, content, finalUrl: candidate.url, via: 'reader' };
  } catch {
    return null;
  }
}

async function firstMatch(list, fn, sku) {
  const results = await Promise.all(list.map(candidate => fn(candidate, sku)));
  return results.find(Boolean) || null;
}

async function findPage(raw) {
  for (const sku of variants(raw)) {
    const list = candidates(sku);
    const direct = await firstMatch(list, directPage, sku);
    if (direct) {
      if (plain(direct.content).length < 500) {
        const reinforced = await readerPage({ brand: direct.brand, region: direct.region, url: direct.finalUrl || direct.url }, sku);
        if (reinforced) return { sku, ...reinforced };
      }
      return { sku, ...direct };
    }
    const reader = await firstMatch(list, readerPage, sku);
    if (reader) return { sku, ...reader };
  }
  return null;
}

function description(content) {
  const html = String(content || '');
  const meta = extractMeta(html, 'description', 'name') || extractMeta(html, 'og:description', 'property');
  if (meta) return meta.slice(0, 1200);

  const lines = plain(content).split('\n').map(x => x.trim()).filter(Boolean);
  const useful = lines.find(line => line.length > 40 && line.length < 500 && /resistente|cron[oô]metro|alarme|bluetooth|solar|autom[aá]tico|anal[oó]gico|digital/i.test(line));
  return String(useful || '').slice(0, 1200);
}

async function enrich(raw) {
  const requested = cleanSku(raw);
  if (!requested) throw Object.assign(new Error('Informe uma referência Casio ou G-Shock.'), { statusCode: 400 });
  if (cache.has(requested)) return cache.get(requested);

  const page = await findPage(requested);
  if (!page) {
    throw Object.assign(
      new Error(`Não encontrei ${requested} nos catálogos oficiais Casio/G-Shock. Confira a referência e tente novamente.`),
      { statusCode: 404 }
    );
  }

  const detalhes = specs(page.content);
  const fotos = images(page.content, page.sku, 6);
  const result = {
    sku: requested,
    nome: productName(page.content, page.sku, page.brand),
    marca: page.brand,
    categoria: 'Relógios',
    desc: description(page.content),
    fotos,
    detalhes,
    fonte: page.finalUrl,
    origem: page.region === 'Brasil'
      ? (page.brand === 'G-Shock' ? 'Casio Brasil — G-Shock' : 'Casio Brasil')
      : `Casio oficial — ${page.region}`,
    aviso: fotos.length ? '' : 'A referência foi confirmada no catálogo oficial, mas nenhuma foto pôde ser extraída automaticamente desta página.'
  };

  cache.set(requested, result);
  return result;
}

async function fetchImage(url) {
  const safe = absoluteImage(url);
  if (!safe) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(safe, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: BASE
      }
    });
    if (!response.ok) return null;
    const type = String(response.headers.get('content-type') || '');
    if (!type.startsWith('image/')) return null;
    return { type, bytes: Buffer.from(await response.arrayBuffer()) };
  } finally {
    clearTimeout(timer);
  }
}

function handler(req, res) {
  enrich(req.query?.sku)
    .then(data => {
      res.set('Cache-Control', 'no-store');
      res.json(data);
    })
    .catch(error => res.status(Number(error?.statusCode) || 502).json({ error: error.message || 'Não foi possível consultar a Casio/G-Shock.' }));
}

function registerCasioEnrichmentV2(app) {
  // A interface administrativa usa esta rota protegida pela sessão do Admin.
  app.get('/api/admin/casio-enrichment', handler);

  // Mantidos como aliases de compatibilidade para instalações anteriores.
  app.get('/api/casio-enrichment', handler);
  app.get('/api/product-enrichment', handler);

  app.get('/api/casio-v2-image', async (req, res) => {
    try {
      const image = await fetchImage(String(req.query?.url || ''));
      if (!image) return res.status(404).send('Imagem Casio indisponível.');
      res.set('Content-Type', image.type);
      res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      res.send(image.bytes);
    } catch {
      res.status(502).send('Não foi possível carregar a imagem Casio.');
    }
  });
}

module.exports = { registerCasioEnrichmentV2 };
