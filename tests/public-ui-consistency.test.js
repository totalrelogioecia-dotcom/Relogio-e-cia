const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('páginas públicas carregam a camada final de consistência visual', () => {
  const pages = [
    'index.html','sobre.html','produtos.html','produto.html','conta.html','carrinho.html',
    'enderecos.html','pagamento.html','pagamento-pix.html','politica-de-privacidade.html',
    'termos-de-uso.html','trocas-estornos.html'
  ];
  for (const page of pages) {
    assert.match(read(page), /public-ui-polish\.css\?v=20260926-ui-unify-1/, page);
  }
});

test('catálogo usa escopo visual próprio', () => {
  assert.match(read('produtos.html'), /<body class="page-products">/);
});

test('cabeçalho, busca, rodapé e catálogo usam acabamento coerente', () => {
  const css = read('public-ui-polish.css');
  assert.match(css, /\.site-header \.nav-links a,[\s\S]*border-radius:7px;/);
  assert.match(css, /\.site-search-panel\{[\s\S]*border-radius:14px;/);
  assert.match(css, /footer \.footer-contact-buttons a\{[\s\S]*border-radius:7px!important;/);
  assert.match(css, /body\.page-products \.filters\{[\s\S]*border-radius:12px;/);
  assert.match(css, /body\.page-products \.product-card\{[\s\S]*border-radius:12px;/);
  assert.match(css, /body\.page-products \.catalog-favorite-button\{[\s\S]*border-radius:7px!important;/);
});
