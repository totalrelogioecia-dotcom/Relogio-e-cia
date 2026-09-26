const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.resolve(__dirname, '..', 'style.css'), 'utf8');

test('carrinho e Produtos têm respiro próprio no cabeçalho desktop', () => {
  assert.match(css, /\.site-header \.nav-utility \+ \.nav-cta\{\s*margin-left:16px;\s*\}/);
});
