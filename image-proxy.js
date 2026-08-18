const { URL } = require('url');

const ALLOWED_HOSTS = new Set(['www.casio.com']);
const ALLOWED_PREFIX = '/content/dam/casio/';
const resolvedSkuCache = new Map();

const USER_AGENT = 'Mozilla/5.0 (compatible; RelogioECia/1.0; +https://relogio-e-cia.onrender.com)';

function isAllowedImageUrl(raw) {
  try {
    const target = new URL(raw);
    return target.protocol === 'https:' && ALLOWED_HOSTS.has(target.hostname) && target.pathname.startsWith(ALLOWED_PREFIX);
  } catch {
    return false;
  }
}

async function fetchCasioImage(raw) {
  if (!isAllowedImageUrl(raw)) return null;
  const upstream = await fetch(raw, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Referer': 'https://www.casio.com/'
    },
    redirect: 'follow'
  });
  if (!upstream.ok) return null;
  const type = String(upstream.headers.get('content-type') || '');
  if (!type.startsWith('image/')) return null;
  return { type, bytes: Buffer.from(await upstream.arrayBuffer()) };
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractOgImage(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return '';
}

async function resolveCasioImageBySku(sku) {
  const clean = String(sku || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!clean || clean.length > 40) return '';
  if (resolvedSkuCache.has(clean)) return resolvedSkuCache.get(clean);

  const pages = [
    `https://www.casio.com/br/watches/gshock/product.${encodeURIComponent(clean)}/`,
    `https://www.casio.com/br/watches/casio/product.${encodeURIComponent(clean)}/`,
    `https://www.casio.com/intl/watches/gshock/product.${encodeURIComponent(clean)}/`,
    `https://www.casio.com/intl/watches/casio/product.${encodeURIComponent(clean)}/`
  ];

  for (const page of pages) {
    try {
      const response = await fetch(page, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7'
        },
        redirect: 'follow'
      });
      if (!response.ok) continue;
      const html = await response.text();
      const image = extractOgImage(html);
      if (image && isAllowedImageUrl(image)) {
        resolvedSkuCache.set(clean, image);
        return image;
      }
    } catch (error) {
      console.warn(`Falha ao resolver foto Casio para ${clean}:`, error.message);
    }
  }

  resolvedSkuCache.set(clean, '');
  return '';
}

function sendImage(res, image) {
  res.set('Content-Type', image.type);
  res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(image.bytes);
}

function registerImageProxy(app) {
  app.get('/api/image-proxy', async (req, res) => {
    try {
      const raw = String(req.query?.url || '').trim();
      if (!raw) return res.status(400).send('URL ausente.');
      if (!isAllowedImageUrl(raw)) return res.status(403).send('Imagem não permitida.');

      const image = await fetchCasioImage(raw);
      if (!image) return res.status(404).send('Não foi possível carregar a imagem.');
      sendImage(res, image);
    } catch (error) {
      console.error('Erro no proxy de imagem:', error.message);
      res.status(502).send('Não foi possível carregar a imagem.');
    }
  });

  // Fallback robusto: descobre a imagem a partir da página oficial do modelo.
  // Isso evita depender de adivinhar a estrutura interna das URLs /content/dam da Casio.
  app.get('/api/product-image', async (req, res) => {
    try {
      const sku = String(req.query?.sku || '').trim();
      if (!sku) return res.status(400).send('SKU ausente.');

      const imageUrl = await resolveCasioImageBySku(sku);
      if (!imageUrl) return res.status(404).send('Foto oficial não encontrada.');

      const image = await fetchCasioImage(imageUrl);
      if (!image) return res.status(404).send('Foto oficial indisponível.');
      sendImage(res, image);
    } catch (error) {
      console.error('Erro ao resolver foto oficial por SKU:', error.message);
      res.status(502).send('Não foi possível carregar a foto oficial.');
    }
  });
}

module.exports = { registerImageProxy };
