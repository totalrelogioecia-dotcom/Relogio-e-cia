const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

test('catálogo-base das marcas trabalhadas contém somente registros completos', () => {
  const catalog = readJson('data/casio-official-catalog.json');
  const products = Object.values(catalog.products || {});

  assert.ok(products.length >= 26);
  for (const product of products) {
    assert.ok(product.sku);
    assert.ok(product.nome);
    assert.ok(['Casio', 'G-Shock', 'Citizen', 'Orient', 'Technos'].includes(product.marca));
    assert.ok(product.desc && product.desc.length >= 30);
    assert.ok(Array.isArray(product.fotos) && product.fotos.length > 0);
    assert.ok(product.fotos.every(url => /^https:\/\//.test(url)));
    assert.ok(/^https:\/\/(www\.)?(casio\.com|technos\.com\.br|citizen\.com\.br|orientrelogios\.com\.br)\//.test(product.fonte));
    assert.ok(product.detalhes?.movimento);
    assert.ok(product.detalhes?.diametro);
    assert.ok(product.detalhes?.resistencia_agua);
  }
});

test('estoque não contém os seis cadastros genéricos incompletos', () => {
  const products = readJson('data/products.json');
  const removedSkus = new Set([
    'CAS-A168-01', 'CAS-EDI-330', 'CAS-F91W',
    'GSH-GA2100', 'GSH-MUD-40', 'GSH-DW5600'
  ]);

  assert.equal(products.some(product => removedSkus.has(product.sku)), false);
});
