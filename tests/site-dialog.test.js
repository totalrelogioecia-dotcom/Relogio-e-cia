const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('avisos de confirmação usam diálogo próprio e acessível', () => {
  const dialog = read('site-dialog.js');
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /event\.key === 'Escape'/);
  assert.match(dialog, /prefers-reduced-motion/);
  assert.match(dialog, /window\.relojaDialog = \{ open \}/);
});

test('fluxos de disponibilidade não usam alertas nativos', () => {
  const catalog = read('catalog-availability.js');
  const product = read('product-confirmation-request.js');
  assert.doesNotMatch(catalog, /\balert\s*\(/);
  assert.doesNotMatch(product, /\balert\s*\(/);
  assert.match(catalog, /title:'Entre na sua conta'/);
  assert.match(catalog, /title:data\.duplicate\?'Solicitação já registrada':'Solicitação enviada'/);
  assert.match(product, /title: 'Entre na sua conta'/);
  assert.match(product, /title: data\.duplicate \? 'Solicitação já registrada' : 'Solicitação enviada'/);
});

test('diálogo carrega antes dos fluxos no catálogo e produto', () => {
  const catalogPage = read('produtos.html');
  const productPage = read('produto.html');
  assert.ok(catalogPage.indexOf('site-dialog.js') < catalogPage.indexOf('catalog-availability.js'));
  assert.ok(productPage.indexOf('site-dialog.js') < productPage.indexOf('product-confirmation-request.js'));
  assert.match(read('public-static-policy.js'), /'site-dialog\.js'/);
});
