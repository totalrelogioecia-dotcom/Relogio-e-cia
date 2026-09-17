const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('catálogo troca o zero inicial por um estado de carregamento honesto', () => {
  const html = read('produtos.html');
  assert.match(html, /Carregando catálogo/);
  assert.match(html, /id="product-grid"[^>]*aria-busy="true"/);
  assert.match(html, /catalog-loading-skeleton/);
  assert.match(html, /catalog-progressive\.js\?v=1/);
});

test('catálogo carrega lotes progressivos e mantém alternativa por botão', () => {
  const source = read('catalog-progressive.js');
  execFileSync(process.execPath, ['--check', path.join(root, 'catalog-progressive.js')], { stdio: 'pipe' });
  assert.match(source, /BATCH_SIZE = 18/);
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /catalog-load-more/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /aria-busy', 'false'/);
});

test('recomendações priorizam pronta-entrega e informam a situação', () => {
  const source = read('product-recommendations.js');
  assert.match(source, /availabilityRank/);
  assert.match(source, /Pronta-entrega/);
  assert.match(source, /Sob encomenda/);
  assert.match(source, /Pedido mediante confirmação/);
  assert.match(source, /Indisponível/);
  assert.match(source, /related-availability/);
});

test('confirmação envia solicitação e deixa WhatsApp como ação separada', () => {
  const product = read('produto.js');
  const request = read('product-confirmation-request.js');
  assert.match(product, /solicitação é enviada ao painel da loja/i);
  assert.match(product, /Falar no WhatsApp/);
  assert.match(request, /Solicitação enviada ✓/);
  assert.match(request, /removeAttribute\('href'\)/);
});

test('novo script permanece explicitamente público', () => {
  const policy = require('../public-static-policy');
  assert.equal(policy.isPublicStaticPath('/catalog-progressive.js'), true);
});
