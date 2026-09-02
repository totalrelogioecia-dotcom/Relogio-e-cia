const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const controls = fs.readFileSync(path.join(root, 'accessibility-controls.js'), 'utf8');
const footer = fs.readFileSync(path.join(root, 'legal-footer.js'), 'utf8');
const mobileFixes = fs.readFileSync(path.join(root, 'mobile-fixes.css'), 'utf8');

test('legal-footer carrega os controles de acessibilidade', () => {
  assert.match(footer, /accessibility-controls\.js\?v=1/);
  assert.match(footer, /ensureAccessibilityControlsScript/);
});

test('desktop padroniza os controles em uma barra global fixa à esquerda', () => {
  assert.match(controls, /reloja-accessibility-global-rail/);
  assert.match(controls, /position:fixed;left:18px;top:42vh/);
  assert.match(controls, /document\.body\.appendChild\(createGroup\('reloja-accessibility-global-rail'\)\)/);
});

test('cabeçalho remove contraste legado e item redundante Nossa loja', () => {
  assert.match(controls, /removeLegacyContrastButton/);
  assert.match(controls, /removeRedundantStoreNav/);
  assert.match(controls, /sobre\.html#loja/);
  assert.match(mobileFixes, /\.reloja-contrast-toggle\{[\s\S]*display:none !important/);
  assert.match(mobileFixes, /a\[href\$="sobre\.html#loja"\]/);
});

test('controles oferecem contraste, texto maior e modo escuro', () => {
  assert.match(controls, /\['contrast', '◐'/);
  assert.match(controls, /\['text', 'A\+'/);
  assert.match(controls, /\['theme', '☾'/);
  assert.match(controls, /reloja-large-text/);
  assert.match(controls, /reloja-dark/);
});

test('preferências visuais são persistidas sem filtrar fotos', () => {
  assert.match(controls, /reloja_high_contrast/);
  assert.match(controls, /reloja_large_text/);
  assert.match(controls, /reloja_dark_mode/);
  assert.match(controls, /localStorage\.setItem/);
  assert.match(controls, /html\.reloja-dark img\{filter:none\}/);
});

test('em telas menores os controles migram para o cabeçalho', () => {
  assert.match(controls, /@media\(max-width:900px\)/);
  assert.match(controls, /reloja-accessibility-header/);
});
