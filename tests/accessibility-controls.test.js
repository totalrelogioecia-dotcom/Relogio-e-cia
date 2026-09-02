const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');

test('Home recebe barra lateral compacta de acessibilidade', () => {
  assert.match(source, /reloja-accessibility-rail/);
  assert.match(source, /\.hero \.frame > \.rail/);
  assert.match(source, /railMark\.insertAdjacentElement\('afterend'/);
});

test('controles oferecem contraste, texto maior e modo escuro', () => {
  assert.match(source, /dataset\.relojaAccessibility/);
  assert.match(source, /tipo: 'contrast'/);
  assert.match(source, /tipo: 'text'/);
  assert.match(source, /tipo: 'theme'/);
  assert.match(source, /reloja-large-text/);
  assert.match(source, /reloja-dark/);
});

test('preferências visuais ficam salvas no navegador', () => {
  assert.match(source, /reloja_high_contrast/);
  assert.match(source, /reloja_large_text/);
  assert.match(source, /reloja_dark_mode/);
  assert.match(source, /localStorage\.setItem/);
});

test('modo escuro não aplica filtro nas imagens e mantém fallback mobile', () => {
  assert.match(source, /html\.reloja-dark img\{filter:none\}/);
  assert.match(source, /@media\(max-width:900px\)/);
  assert.match(source, /reloja-accessibility-header/);
});
