const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const {
  productJsonLd,
  enhanceProductHtml,
  registerSeoRoutes,
  visibleProducts
} = require('../seo-routes');

test('Product/Offer usa dados reais do produto e moeda BRL', () => {
  const product = {
    id: 77,
    nome: 'Relógio Teste',
    marca: 'Casio',
    sku: 'ABC-123',
    preco: 459.9,
    estoque: 2,
    desc: 'Relógio de teste para SEO.',
    fotos: ['/assets/teste.webp']
  };
  const data = productJsonLd(product, 'https://example.com');
  assert.equal(data['@type'], 'Product');
  assert.equal(data.name, product.nome);
  assert.equal(data.sku, product.sku);
  assert.equal(data.brand.name, product.marca);
  assert.equal(data.image[0], 'https://example.com/assets/teste.webp');
  assert.equal(data.offers['@type'], 'Offer');
  assert.equal(data.offers.price, '459.90');
  assert.equal(data.offers.priceCurrency, 'BRL');
  assert.equal(data.offers.availability, 'https://schema.org/InStock');
  assert.equal(data.offers.itemCondition, 'https://schema.org/NewCondition');
});

test('produto sem estoque é marcado como OutOfStock', () => {
  const data = productJsonLd({
    id: 88,
    nome: 'Relógio sem estoque',
    marca: 'Technos',
    sku: 'SEM-1',
    preco: 500,
    estoque: 0,
    fotos: ['https://cdn.example.com/relogio.jpg']
  }, 'https://example.com');
  assert.equal(data.offers.availability, 'https://schema.org/OutOfStock');
});

test('HTML de produto recebe canonical, Open Graph e JSON-LD no servidor', () => {
  const product = visibleProducts()[0];
  if (!product) return;
  const html = '<!doctype html><html><head><title>Produto — Relógio e Cia</title><meta name="description" content="Genérica"></head><body></body></html>';
  const req = {
    query: { id: String(product.id) },
    protocol: 'https',
    get(name) {
      if (String(name).toLowerCase() === 'host') return 'loja.example.com';
      if (String(name).toLowerCase() === 'x-forwarded-proto') return 'https';
      return '';
    }
  };
  const output = enhanceProductHtml(req, html);
  assert.match(output, /rel="canonical"/);
  assert.match(output, /property="og:type" content="product"/);
  assert.match(output, /type="application\/ld\+json"/);
  assert.match(output, /"@type":"Product"/);
  assert.match(output, /"@type":"Offer"/);
  assert.match(output, /"priceCurrency":"BRL"/);
});

test('produto inexistente recebe noindex em vez de markup comercial', () => {
  const html = '<html><head><title>Produto</title></head><body></body></html>';
  const req = { query: { id: '999999999' }, protocol: 'https', get: () => 'example.com' };
  const output = enhanceProductHtml(req, html);
  assert.match(output, /name="robots" content="noindex,follow"/);
  assert.doesNotMatch(output, /application\/ld\+json/);
});

test('sitemap inclui somente produtos visíveis', () => {
  const routes = {};
  const app = { get(route, handler) { routes[route] = handler; } };
  registerSeoRoutes(app);
  assert.equal(typeof routes['/sitemap.xml'], 'function');
  assert.equal(typeof routes['/robots.txt'], 'function');

  let body = '';
  const req = { protocol: 'https', get(name) { return String(name).toLowerCase() === 'host' ? 'example.com' : ''; } };
  const res = { type() { return this; }, send(value) { body = String(value); return this; } };
  routes['/sitemap.xml'](req, res);

  for (const product of visibleProducts().slice(0, 5)) {
    assert.match(body, new RegExp(`produto\\.html\\?id=${product.id}`));
  }
  assert.match(body, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
});

test('auth bootstrap injeta SEO antes de servir produto e registra sitemap', () => {
  const bootstrap = read('auth-bootstrap.js');
  assert.match(bootstrap, /enhanceProductHtml\(req, html\)/);
  assert.match(bootstrap, /registerSeoRoutes\(app\)/);
  assert.ok(bootstrap.indexOf('registerSeoRoutes(app)') < bootstrap.indexOf('registerAuthRoutes(app)'));
});
