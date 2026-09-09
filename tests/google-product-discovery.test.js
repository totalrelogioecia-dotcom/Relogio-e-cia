const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function loadSeoModule(products) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-google-discovery-'));
  fs.writeFileSync(path.join(tempDir, 'products.json'), JSON.stringify(products, null, 2), 'utf8');

  const previousDataDir = process.env.DATA_DIR;
  const previousBaseUrl = process.env.PUBLIC_BASE_URL;
  process.env.DATA_DIR = tempDir;
  process.env.PUBLIC_BASE_URL = 'https://loja.exemplo.com';

  const modulePath = require.resolve('../seo-routes');
  delete require.cache[modulePath];
  const seo = require('../seo-routes');

  return {
    seo,
    cleanup() {
      delete require.cache[modulePath];
      if (previousDataDir === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = previousDataDir;
      if (previousBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
      else process.env.PUBLIC_BASE_URL = previousBaseUrl;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

test('catálogo entrega links reais para produtos visíveis sem depender de JavaScript', () => {
  const { seo, cleanup } = loadSeoModule([
    { id: 10, nome: 'Casio & Teste', ativo: true },
    { id: 11, nome: 'Produto oculto', ativo: false }
  ]);

  try {
    const html = '<!doctype html><html><head><title>Catálogo</title></head><body><div class="product-grid" id="product-grid"></div></body></html>';
    const output = seo.enhanceCatalogHtml({}, html);

    assert.match(output, /id="catalog-product-discovery"/);
    assert.match(output, /href="\/produto\.html\?id=10"/);
    assert.match(output, /Casio &amp; Teste/);
    assert.doesNotMatch(output, /produto\.html\?id=11/);
    assert.match(output, /<div class="product-grid" id="product-grid"><\/div>/);
  } finally {
    cleanup();
  }
});

test('catálogo publica ItemList e canonical com todas as páginas visíveis', () => {
  const { seo, cleanup } = loadSeoModule([
    { id: 21, nome: 'Relógio A', ativo: true },
    { id: 22, nome: 'Relógio B', ativo: true }
  ]);

  try {
    const html = '<html><head></head><body><div class="product-grid" id="product-grid"></div></body></html>';
    const output = seo.enhanceCatalogHtml({}, html);

    assert.match(output, /rel="canonical" href="https:\/\/loja\.exemplo\.com\/produtos\.html"/);
    assert.match(output, /id="catalog-itemlist-structured-data"/);
    assert.match(output, /"@type":"ItemList"/);
    assert.match(output, /"numberOfItems":2/);
    assert.match(output, /https:\/\/loja\.exemplo\.com\/produto\.html\?id=21/);
    assert.match(output, /https:\/\/loja\.exemplo\.com\/produto\.html\?id=22/);
  } finally {
    cleanup();
  }
});

test('sem produtos visíveis o HTML do catálogo não é alterado', () => {
  const { seo, cleanup } = loadSeoModule([
    { id: 30, nome: 'Oculto', ativo: false }
  ]);

  try {
    const html = '<html><head></head><body><div class="product-grid" id="product-grid"></div></body></html>';
    assert.equal(seo.enhanceCatalogHtml({}, html), html);
  } finally {
    cleanup();
  }
});
