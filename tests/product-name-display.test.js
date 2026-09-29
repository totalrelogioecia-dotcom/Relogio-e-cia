const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('utilitário remove a marca apenas do início do nome exibido', () => {
  const ui = read('site-ui.js');
  assert.match(ui, /function nomeProdutoSemMarca\(nome, marca\)/);
  assert.match(ui, /normalizedBrand === 'gshock'/);
  assert.match(ui, /aliases\.push\('G-Shock', 'G Shock', 'GSHOCK'\)/);
  assert.match(ui, /window\.nomeProdutoSemMarca = nomeProdutoSemMarca/);
});

test('catálogo, Home, produto, busca e favoritos usam nome sem marca', () => {
  assert.match(read('script.js'), /window\.nomeProdutoSemMarca\(p\.nome, p\.marca\)/);
  assert.match(read('home-enhancements.js'), /window\.nomeProdutoSemMarca\(produto\.nome \|\| 'Relógio', produto\.marca \|\| marca\)/);
  assert.match(read('produto.js'), /<h1>\$\{esc\(displayName\(p\)\)\}<\/h1>/);
  assert.match(read('produto.js'), /<h3>\$\{esc\(displayName\(r\)\)\}<\/h3>/);
  assert.match(read('site-search.js'), /window\.nomeProdutoSemMarca\(product\.nome \|\| 'Produto', product\.marca \|\| ''\)/);
  assert.match(read('favorites-client.js'), /window\.nomeProdutoSemMarca\(p\.nome,p\.marca\)/);
});

test('dados originais continuam intactos para SEO, alt e integrações', () => {
  const product = read('produto.js');
  const catalog = read('script.js');
  assert.match(product, /document\.title=\`\$\{p\.nome\} — Relógio e Cia\`/);
  assert.match(product, /\+p\.nome\+' \(Ref\. '\+p\.sku/);
  assert.match(catalog, /const nomeCompleto = escaparHtmlSeguro\(p\.nome\)/);
  assert.match(catalog, /alt="\$\{nomeCompleto\}"/);
});

test('páginas principais carregam versões atuais dos scripts', () => {
  assert.match(read('index.html'), /site-ui\.js\?v=20260928-product-names-1/);
  assert.match(read('index.html'), /home-enhancements\.js\?v=20260928-product-names-1/);
  assert.match(read('produtos.html'), /script\.js\?v=20260929-brand-logos-2/);
  assert.match(read('produto.html'), /produto\.js\?v=20260929-contact-1/);
  assert.match(read('conta.html'), /site-ui\.js\?v=20260928-product-names-1/);
});
