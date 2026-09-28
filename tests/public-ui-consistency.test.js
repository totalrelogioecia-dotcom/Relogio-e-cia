const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('páginas públicas carregam a camada final de consistência visual', () => {
  const pages = [
    'index.html','sobre.html','produto.html','conta.html','carrinho.html',
    'enderecos.html','pagamento.html','pagamento-pix.html','politica-de-privacidade.html',
    'termos-de-uso.html','trocas-estornos.html'
  ];
  for (const page of pages) {
    assert.match(read(page), /public-ui-polish\.css\?v=20260926-mobile-polish-1/, page);
  }
  assert.match(read('produtos.html'), /public-ui-polish\.css\?v=20260928-citizen-font-1/, 'produtos.html');
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
  assert.match(css, /body\.page-products \.product-card\{[\s\S]*border-radius:0;/);
  assert.match(css, /body\.page-products \.catalog-favorite-button\{[\s\S]*border-radius:7px!important;/);
});


test('mobile mantém catálogo, Home e rodapé alinhados', () => {
  const css = read('public-ui-polish.css');
  const home = read('home-redesign.css');
  const filters = read('catalog-mobile-filters.js');
  const footer = read('legal-footer.js');

  assert.match(css, /@media \(max-width:860px\)[\s\S]*grid-template-areas:[\s\S]*"filter count"[\s\S]*"sort sort"/);
  assert.match(css, /body\.page-products \.sort-control\{[\s\S]*grid-template-columns:1fr;/);
  assert.match(filters, /const toolbar = layout\.querySelector\('\.products-toolbar'\);[\s\S]*toolbar\.prepend\(controls\)/);
  assert.match(home, /@media \(max-width:620px\)[\s\S]*body\.page-home #home-selection\.home-intro\{[\s\S]*padding:18px 16px 0;/);
  assert.match(home, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\);[\s\S]*font-size:\.62rem;/);
  assert.match(footer, /@media\(max-width:640px\)\{[\s\S]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
});
