const fs = require('fs');
const path = require('path');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const PRODUCTS = path.join(DATA, 'products.json');
const DETAILS = path.join(DATA, 'product-details.json');

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

function firstPhotoRaw(product) {
  if (Array.isArray(product?.fotos)) return String(product.fotos.find(Boolean) || '').trim();
  return String(product?.foto || '').trim();
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

function catalogItemListJsonLd(products, origin) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Catálogo de relógios da Relógio e Cia',
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: String(product.nome || '').trim(),
      url: `${origin}/produto.html?id=${encodeURIComponent(product.id)}`
    }))
  };
}

function enhanceCatalogHtml(req, html) {
  const products = visibleProducts();
  if (!products.length) return html;

  const origin = requestOrigin(req);
  const canonical = `${origin}/produtos.html`;
  const jsonLd = JSON.stringify(catalogItemListJsonLd(products, origin)).replace(/</g, '\\u003c');
  const headSeo = [
    '<meta name="robots" content="index,follow,max-image-preview:large">',
    `<link rel="canonical" href="${htmlEscape(canonical)}">`,
    `<script type="application/ld+json" id="catalog-itemlist-structured-data">${jsonLd}</script>`
  ].join('\n');

  let output = html.replace('</head>', `${headSeo}\n</head>`);

  const links = products.map(product => {
    const url = `/produto.html?id=${encodeURIComponent(product.id)}`;
    return `<li><a href="${htmlEscape(url)}">${htmlEscape(product.nome || `Produto ${product.id}`)}</a></li>`;
  }).join('');
  const noScriptFallback = [
    '<noscript id="catalog-product-discovery">',
    '<section aria-label="Catálogo de produtos">',
    '<h2>Catálogo de produtos</h2>',
    '<p>Ative o JavaScript para usar os filtros e recursos interativos do catálogo.</p>',
    `<ul>${links}</ul>`,
    '</section>',
    '</noscript>'
  ].join('');

  const gridPattern = /<div\s+class=["']product-grid["']\s+id=["']product-grid["']\s*><\/div>/i;
  if (gridPattern.test(output)) {
    output = output.replace(gridPattern, `${noScriptFallback}\n$&`);
  } else {
    output = output.replace('</body>', `${noScriptFallback}\n</body>`);
  }

  return output;
}

function merchantImageLink(product, origin) {
  const raw = firstPhotoRaw(product);
  if (!raw) return '';
  if (/^data:image\//i.test(raw)) {
    return `${origin}/merchant-product-image/${encodeURIComponent(product.id)}`;
  }
  const url = absoluteUrl(origin, raw);
  return /^https?:\/\//i.test(url) ? url : '';
}

function decodeDataImage(raw) {
  const match = String(raw || '').match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  try {
    const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) return null;
    const type = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
    return { type, bytes };
  } catch {
    return null;
  }
}

function merchantFeedXml(products, details, origin) {
  const items = products.map(product => {
    const id = Number(product.id);
    const name = String(product.nome || '').trim().slice(0, 150);
    const brand = String(product.marca || '').trim();
    const sku = String(product.sku || '').trim().slice(0, 70);
    const price = Number(product.preco);
    const image = merchantImageLink(product, origin);
    if (!Number.isFinite(id) || id <= 0 || !name || !brand || !Number.isFinite(price) || price <= 0 || !image) return '';

    const detail = details && typeof details === 'object' && !Array.isArray(details)
      ? (details[String(id)] || {})
      : {};
    const color = String(detail.cor || '').trim().slice(0, 100);
    const category = String(product.categoria || 'Relógios').trim().slice(0, 100);
    const link = `${origin}/produto.html?id=${encodeURIComponent(id)}`;
    const availability = Math.max(0, Number(product.estoque) || 0) > 0 ? 'in_stock' : 'out_of_stock';
    const description = productDescription(product).slice(0, 5000);

    return [
      '    <item>',
      `      <g:id>${xmlEscape(`relogio-${id}`)}</g:id>`,
      `      <g:title>${xmlEscape(name)}</g:title>`,
      `      <g:description>${xmlEscape(description)}</g:description>`,
      `      <g:link>${xmlEscape(link)}</g:link>`,
      `      <g:image_link>${xmlEscape(image)}</g:image_link>`,
      '      <g:condition>new</g:condition>',
      `      <g:availability>${availability}</g:availability>`,
      `      <g:price>${price.toFixed(2)} BRL</g:price>`,
      `      <g:brand>${xmlEscape(brand)}</g:brand>`,
      sku ? `      <g:mpn>${xmlEscape(sku)}</g:mpn>` : '',
      color ? `      <g:color>${xmlEscape(color)}</g:color>` : '',
      category ? `      <g:product_type>${xmlEscape(`${category} > ${brand}`)}</g:product_type>` : '',
      '    </item>'
    ].filter(Boolean).join('\n');
  }).filter(Boolean).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">',
    '  <channel>',
    '    <title>Relógio e Cia — Catálogo</title>',
    `    <link>${xmlEscape(`${origin}/`)}</link>`,
    '    <description>Catálogo de produtos da Relógio e Cia para o Google Merchant Center.</description>',
    items,
    '  </channel>',
    '</rss>',
    ''
  ].join('\n');
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

  app.get('/google-merchant-feed.xml', (req, res) => {
    const origin = requestOrigin(req);
    const details = readJson(DETAILS, {});
    res.set('Cache-Control', 'public, max-age=300');
    res.set('X-Content-Type-Options', 'nosniff');
    res.type('application/xml').send(merchantFeedXml(visibleProducts(), details, origin));
  });

  app.get('/merchant-product-image/:id', (req, res) => {
    const product = findVisibleProduct(req.params.id);
    if (!product) return res.status(404).end();
    const raw = firstPhotoRaw(product);
    const image = decodeDataImage(raw);
    if (!image) return res.status(404).end();
    res.set('Content-Type', image.type);
    res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.set('X-Content-Type-Options', 'nosniff');
    return res.send(image.bytes);
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
  catalogItemListJsonLd,
  enhanceProductHtml,
  enhanceCatalogHtml,
  merchantImageLink,
  merchantFeedXml,
  decodeDataImage,
  registerSeoRoutes,
  visibleProducts
};