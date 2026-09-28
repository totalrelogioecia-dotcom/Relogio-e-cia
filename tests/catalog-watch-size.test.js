const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('fotos dos relógios ocupam um pouco mais do card do catálogo', () => {
  const css = read('style.css');
  assert.match(css, /\.product-card \.card-photo img\{[^}]*padding:16px;/);
  assert.doesNotMatch(css, /\.product-card \.card-photo img\{[^}]*padding:24px;/);
});

test('catálogo carrega a versão nova do estilo dos cards', () => {
  const html = read('produtos.html');
  assert.match(html, /style\.css\?v=cards-photo-size-2/);
});
