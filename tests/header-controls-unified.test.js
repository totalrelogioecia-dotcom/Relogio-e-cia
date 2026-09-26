const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.resolve(__dirname, '..', 'style.css'), 'utf8');

test('controles neutros do cabeçalho compartilham o mesmo acabamento', () => {
  assert.match(css, /\.site-header \.nav-links a,[\s\S]*\.site-header \.site-search-button\{[\s\S]*min-height:44px;[\s\S]*padding:0 14px;[\s\S]*border:1px solid transparent;/);
});

test('hover e página ativa usam o mesmo sistema visual', () => {
  assert.match(css, /\.site-header \.nav-links a:hover,[\s\S]*border-color:var\(--line\);/);
  assert.match(css, /\.site-header \.nav-links a\[aria-current="page"\],[\s\S]*box-shadow:inset 0 -2px 0 var\(--red\);/);
});

test('Produtos permanece CTA vermelho separado', () => {
  assert.match(css, /\.site-header \.nav-cta\{[\s\S]*background:var\(--red\);[\s\S]*border:1px solid var\(--red\);/);
  assert.match(css, /\.site-header \.nav-utility \+ \.nav-cta\{\s*margin-left:16px;\s*\}/);
});
