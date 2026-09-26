const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('catálogo usa wordmarks de todas as cinco marcas', () => {
  const js = read('script.js');
  for (const brand of ['technos','casio','g-shock','citizen','orient']) {
    assert.match(js, new RegExp(`'${brand}'\\s*:\\s*\\{`), brand);
  }
  assert.match(js, /function renderBrandChip\(marca\)/);
  assert.match(js, /\$\{renderBrandChip\(p\.marca\)\}/);
});

test('etiquetas preservam cores dos wordmarks sobre fundo neutro', () => {
  const css = read('public-ui-polish.css');
  assert.match(css, /\.brand-chip-logo\{[\s\S]*background:#fff;/);
  assert.match(css, /\.brand-chip--technos img/);
  assert.match(css, /\.brand-chip--casio img/);
  assert.match(css, /\.brand-chip--g-shock img/);
  assert.match(css, /\.brand-chip--citizen img/);
  assert.match(css, /\.brand-chip--orient img/);
});

test('página de produtos força versão nova do JS e CSS', () => {
  const html = read('produtos.html');
  assert.match(html, /public-ui-polish\.css\?v=20260926-brand-wordmarks-1/);
  assert.match(html, /script\.js\?v=20260926-brand-wordmarks-1/);
});
