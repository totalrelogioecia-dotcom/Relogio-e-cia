const fs = require('fs');
const path = require('path');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const PRODUCTS = path.join(DATA, 'products.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function xmlEscape(value) {
  return String(value ?? '').replace(/[<>&'\"]/g, char => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  }[char]));
}

function requestOrigin(req) {
  const configured = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (/^https?:\/\//i.test(configured)) return configured;
  const forwarded = String(req.get?.('x-forwarded-proto') || '').split(',')[0].trim();
  const protocol = forwarded || req.protocol || 'https';
  const host = req.get?.('host') || 'relogio-e-cia.onrender.com';
  return `${protocol}://${host}`;
}

function absoluteUrl(origin, value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try { return new URL(raw, `${origin}/`).toString(); }
  catch { return ''; }
}

function visibleProducts() {
  const products = readJson(PRODUCTS, []);
  return Array.isArray(products) ? products.filter(product => product && product.ativo !== false) : [];
}

function findVisibleProduct(id) {
  return visibleProducts().find(product => Number(product.id) === Number(id)) || null;
}

function firstPhotos(product, origin) {
  const raw = Array.isArray(product?.fotos) ? product.fotos : [product?.foto];
  return raw.map(value => absoluteUrl(origin, value)).filter(Boolean).slice(0, 8);
}

function productDescription(product) {
  const text = String(product?.desc || '').replace(/\s+/g, ' ').trim();
  return (text || `${product?.nome || 'Relógio'} da ${product?.marca || 'Relógio e Cia'}.`).slice(0, 300);
}

function productJsonLd(product, origin) {
  const url = `${origin}/produto.html?id=${encodeURIComponent(product.id)}`;
  const images = firstPhotos(product, origin);
  const stock = Math.max(0, Number(product.estoque) || 0);
  const price = Math.max(0, Number(product.preco) || 0).toFixed(2);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: String(product.nome || '').trim(),
    description: productDescription(product),
    sku: String(product.sku || '').trim(),
    brand: {
      '@type': 'Brand',
      name: String(product.marca || 'Relógio e Cia').trim()
    },
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'BRL',
      price,
      availability: stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'Organization',
        name: 'Relógio e Cia'
      }
    }
  };
  if (images.length) data.image = images;
  return data;
}

function enhanceProductHtml(req, html) {
  const id = Number(req.query?.id);
  if (!Number.isFinite(id) || id <= 0) return html;
  const product = findVisibleProduct(id);
  if (!product) {
    return html.replace('</head>', '<meta name="robots" content="noindex,follow">\n</head>');
  }

  const origin = requestOrigin(req);
  const canonical = `${origin}/produto.html?id=${encodeURIComponent(product.id)}`;
  const title = `${product.nome} — Relógio e Cia`;
  const description = productDescription(product).slice(0, 160);
  const images = firstPhotos(product, origin);
  const jsonLd = JSON.stringify(productJsonLd(product, origin)).replace(/</g, '\\u003c');

  let output = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${htmlEscape(title)}</title>`)
    .replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${htmlEscape(description)}">`);

  const seo = [
    '<meta name="robots" content="index,follow,max-image-preview:large">',
    `<link rel="canonical" href="${htmlEscape(canonical)}">`,
    `<meta property="og:type" content="product">`,
    `<meta property="og:site_name" content="Relógio e Cia">`,
    `<meta property="og:title" content="${htmlEscape(title)}">`,
    `<meta property="og:description" content="${htmlEscape(description)}">`,
    `<meta property="og:url" content="${htmlEscape(canonical)}">`,
    images[0] ? `<meta property="og:image" content="${htmlEscape(images[0])}">` : '',
    `<meta property="product:price:amount" content="${Math.max(0, Number(product.preco) || 0).toFixed(2)}">`,
    '<meta property="product:price:currency" content="BRL">',
    `<script type="application/ld+json" id="product-structured-data">${jsonLd}</script>`
  ].filter(Boolean).join('\n');

  return output.replace('</head>', `${seo}\n</head>`);
}

function registerSeoRoutes(app) {
  app.get('/robots.txt', (req, res) => {
    const origin = requestOrigin(req);
    res.type('text/plain').send([
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin.html',
      'Disallow: /api/',
      `Sitemap: ${origin}/sitemap.xml`,
      ''
    ].join('\n'));
  });

  app.get('/sitemap.xml', (req, res) => {
    const origin = requestOrigin(req);
    const staticUrls = [
      ['/', '1.0'],
      ['/produtos.html', '0.9'],
      ['/sobre.html', '0.6']
    ];
    const productUrls = visibleProducts().map(product => [
      `/produto.html?id=${encodeURIComponent(product.id)}`,
      '0.8'
    ]);
    const rows = [...staticUrls, ...productUrls]
      .map(([pathname, priority]) => `  <url><loc>${xmlEscape(`${origin}${pathname}`)}</loc><priority>${priority}</priority></url>`)
      .join('\n');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`);
  });
}

module.exports = {
  requestOrigin,
  productJsonLd,
  enhanceProductHtml,
  registerSeoRoutes,
  visibleProducts
};
