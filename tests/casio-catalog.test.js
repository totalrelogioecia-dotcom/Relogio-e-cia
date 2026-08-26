const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const readText = file => fs.readFileSync(path.join(root, file), 'utf8');

test('estoque não contém os seis cadastros genéricos incompletos', () => {
  const products = readJson('data/products.json');
  const removedSkus = new Set([
    'CAS-A168-01', 'CAS-EDI-330', 'CAS-F91W',
    'GSH-GA2100', 'GSH-MUD-40', 'GSH-DW5600'
  ]);

  assert.equal(products.some(product => removedSkus.has(product.sku)), false);
});

test('vitrine pública mantém ativos somente produtos completos com foto', () => {
  const products = readJson('data/products.json');
  const active = products.filter(product => product.ativo !== false);

  assert.ok(active.length > 0);
  for (const product of active) {
    assert.ok(product.nome);
    assert.ok(product.sku);
    assert.ok(product.marca);
    assert.ok(Array.isArray(product.fotos) && product.fotos.some(url => /^https:\/\//.test(url)));
  }
});

test('pesquisa administrativa usa somente produtos reais e preserva filtro de ocultos', () => {
  const source = readText('admin-stock-catalog.js');
  assert.match(source, /\/api\/admin\/products/);
  assert.match(source, /value="oculto">Ocultos/);
  assert.doesNotMatch(source, /\/api\/admin\/catalog-base/);
});

test('produto sem estoque oferece cadastro de aviso de reposição', () => {
  const productSource = readText('produto.js');
  const alertSource = readText('stock-alerts.js');
  assert.match(productSource, /Esse produto encontra-se indisponível\./);
  assert.match(productSource, /Deixe seu e-mail que avisaremos quando chegar\./);
  assert.match(productSource, /\/api\/stock-alerts/);
  assert.match(alertSource, /status: 'pending'/);
  assert.match(alertSource, /api\.resend\.com\/emails/);
});
