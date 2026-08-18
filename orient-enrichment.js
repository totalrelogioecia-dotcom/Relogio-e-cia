const { URL } = require('url');

const USER_AGENT = 'Mozilla/5.0 (compatible; RelogioECia/1.0; +https://relogio-e-cia.onrender.com)';
const PANEL_BASE = 'https://painelfotos.orientnet.com.br/';
const cache = new Map();

function cleanCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9._/-]/g, '').slice(0, 60);
}

function decodeHtml(value) {
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

function isOrientHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === 'orientnet.com.br' || h.endsWith('.orientnet.com.br');
}

function allowedOrientUrl(raw) {
  try {
    const u = new URL(raw, PANEL_BASE);
    return u.protocol === 'https:' && isOrientHost(u.hostname);
  } catch {
    return false;
  }
}

function absoluteOrientUrl(raw) {
  try {
    const value = decodeHtml(raw).trim();
    if (!value || /^(?:data:|javascript:|#)/i.test(value)) return '';
    const u = new URL(value, PANEL_BASE);
    return allowedOrientUrl(u.toString()) ? u.toString() : '';
  } catch {
    return '';
  }
}

function extractTitle(html, code) {
  const text = decodeHtml(html);
  const patterns = [
    /<(?:h1|h2|h3)[^>]*>([\s\S]*?)<\/(?:h1|h2|h3)>/gi,
    /<title[^>]*>([\s\S]*?)<\/title>/gi
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) {
      const value = String(m[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!value || /painel de fotos|orient relógio|orient relogio/i.test(value)) continue;
      if (value.toUpperCase().includes(code) || /rel[oó]gio|watch|modelo/i.test(value)) return value.slice(0, 180);
    }
  }
  return '';
}

function extractDescription(html) {
  const patterns = [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i
  ];
  for (const re of patterns) {
    const m = html.match(re);
    const value = decodeHtml(m?.[1] || '').replace(/\s+/g, ' ').trim();
    if (value && !/painel de fotos/i.test(value)) return value.slice(0, 1000);
  }
  return '';
}

function collectImages(html, code, max = 8) {
  const normalized = decodeHtml(html);
  const candidates = [];
  const patterns = [
    /(?:src|data-src|href)\s*=\s*["']([^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/gi,
    /https:\/\/[^\s"'<>]+\.(?:jpe?g|png|webp)(?:\?[^\s"'<>]*)?/gi,
    /\/[A-Za-z0-9_./%?=&-]+\.(?:jpe?g|png|webp)(?:\?[^\s"'<>]*)?/gi
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(normalized))) {
      const raw = m[1] || m[0];
      const url = absoluteOrientUrl(raw.replace(/[),;]+$/g, ''));
      if (!url || candidates.includes(url)) continue;
      candidates.push(url);
    }
  }
  const compactCode = code.toLowerCase().replace(/[^a-z0-9]/g, '');
  const score = url => {
    const lower = decodeURIComponent(url).toLowerCase();
    const compact = lower.replace(/[^a-z0-9]/g, '');
    let points = 0;
    if (lower.includes(code.toLowerCase())) points += 100;
    if (compactCode && compact.includes(compactCode)) points += 80;
    if (/produto|relogio|rel[oó]gio|foto|image|img|modelo/.test(lower)) points += 15;
    if (/logo|icon|icone|banner|background|bg|facebook|instagram|youtube/.test(lower)) points -= 80;
    return points;
  };
  return candidates.sort((a,b)=>score(b)-score(a)).filter(u=>score(u) >= 0).slice(0,max);
}

async function fetchBinary(url) {
  if (!allowedOrientUrl(url)) return null;
  const r = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Referer': PANEL_BASE
    },
    redirect: 'follow'
  });
  if (!r.ok) return null;
  const type = String(r.headers.get('content-type') || '').toLowerCase();
  if (!type.startsWith('image/')) return null;
  return { type, bytes: Buffer.from(await r.arrayBuffer()) };
}

async function enrichOrient(code) {
  const clean = cleanCode(code);
  if (!clean) throw Object.assign(new Error('Referência Orient inválida.'), { statusCode: 400 });
  const key = `orient:${clean}`;
  if (cache.has(key)) return cache.get(key);

  const pageUrl = `${PANEL_BASE}?Codigo=${encodeURIComponent(clean)}`;
  const response = await fetch(pageUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'pt-BR,pt;q=0.9'
    },
    redirect: 'follow'
  });
  if (!response.ok) throw Object.assign(new Error('Não foi possível consultar o Painel de Fotos da Orient.'), { statusCode: 502 });
  const html = await response.text();
  const rawPhotos = collectImages(html, clean, 12);
  const validPhotos = [];
  for (const url of rawPhotos) {
    if (validPhotos.length >= 8) break;
    try {
      if (await fetchBinary(url)) validPhotos.push(`/api/orient-image?url=${encodeURIComponent(url)}`);
    } catch {}
  }

  // O painel é principalmente uma fonte oficial de imagens; quando não houver
  // ficha técnica publicada nele, deixamos esses campos vazios para não inventar dados.
  const foundTitle = extractTitle(html, clean);
  if (!validPhotos.length && !foundTitle && !html.toUpperCase().includes(clean)) {
    throw Object.assign(new Error('Não encontrei essa referência no Painel de Fotos da Orient.'), { statusCode: 404 });
  }

  const result = {
    sku: clean,
    nome: foundTitle,
    marca: 'Orient',
    categoria: 'Relógios',
    desc: extractDescription(html),
    fotos: validPhotos,
    detalhes: {},
    fonte: response.url || pageUrl,
    origem: 'Painel de Fotos oficial Orient',
    aviso: validPhotos.length ? '' : 'A referência foi localizada, mas nenhuma foto utilizável foi encontrada automaticamente.'
  };
  cache.set(key, result);
  return result;
}

function registerOrientEnrichment(app) {
  app.get('/api/orient-image', async (req, res) => {
    try {
      const raw = String(req.query?.url || '').trim();
      if (!raw || !allowedOrientUrl(raw)) return res.status(403).send('Imagem Orient não permitida.');
      const image = await fetchBinary(raw);
      if (!image) return res.status(404).send('Imagem Orient indisponível.');
      res.set('Content-Type', image.type);
      res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      res.set('X-Content-Type-Options', 'nosniff');
      res.send(image.bytes);
    } catch (error) {
      console.error('Erro no proxy de imagem Orient:', error.message);
      res.status(502).send('Não foi possível carregar a imagem Orient.');
    }
  });

  app.get('/api/orient-enrichment', async (req, res) => {
    try {
      const data = await enrichOrient(req.query?.sku);
      res.set('Cache-Control', 'no-store');
      res.json(data);
    } catch (error) {
      res.status(Number(error?.statusCode) || 502).json({ error: error.message || 'Não foi possível consultar a Orient.' });
    }
  });
}

module.exports = { registerOrientEnrichment };
