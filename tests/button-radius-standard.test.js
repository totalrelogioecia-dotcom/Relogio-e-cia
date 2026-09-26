const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.resolve(__dirname, '..', 'style.css'), 'utf8');

test('botões usam raio visual padrão de 7px', () => {
  assert.match(css, /--control-radius:\s*7px;/);
  assert.match(css, /\.btn\{[\s\S]*border-radius:var\(--control-radius\);/);
});

test('controles do cabeçalho usam o mesmo raio dos botões', () => {
  assert.match(css, /\.site-header \.nav-links a,[\s\S]*\.site-header \.nav-toggle\{[\s\S]*border-radius:var\(--control-radius\);/);
});

test('badge do carrinho continua circular', () => {
  assert.match(css, /\.cart-badge\{[\s\S]*border-radius:50%;/);
});
