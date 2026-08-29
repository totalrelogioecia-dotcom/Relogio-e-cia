const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('catálogo carrega painel de filtros mobile acessível', () => {
  const html = read('produtos.html');
  const css = read('catalog-filters.css');
  const js = read('catalog-mobile-filters.js');

  assert.match(html, /catalog-mobile-filters\.js\?v=1/);
  assert.match(js, /aria-expanded/);
  assert.match(js, /catalog-filters-open/);
  assert.match(js, /Escape/);
  assert.match(css, /\.catalog-mobile-filter-trigger/);
  assert.match(css, /position:fixed/);
  assert.match(css, /body\.catalog-filters-open/);
});

test('acabamento visual global preserva legibilidade e swipe do mostruário', () => {
  const loader = read('mobile-fixes.css');
  const polish = read('visual-polish.css');

  assert.match(loader, /@import url\('visual-polish\.css'\)/);
  assert.match(polish, /font-size:\.55rem !important/);
  assert.match(polish, /font-size:\.68rem !important/);
  assert.match(polish, /overflow-x:auto !important/);
  assert.match(polish, /scroll-snap-type:x mandatory/);
  assert.match(polish, /border-radius:0 !important/);
});

test('páginas principais não exibem mais aviso de site ilustrativo', () => {
  const pages = ['index.html', 'produtos.html', 'produto.html', 'carrinho.html', 'conta.html', 'sobre.html'];
  for (const page of pages) {
    const html = read(page);
    assert.doesNotMatch(html, /Site meramente ilustrativo/i, page);
    assert.match(html, /Compra online com atendimento pós-venda/i, page);
  }
});
