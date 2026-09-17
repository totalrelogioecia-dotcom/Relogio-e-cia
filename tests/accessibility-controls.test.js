const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const controls = fs.readFileSync(path.join(root, 'accessibility-controls.js'), 'utf8');
const footer = fs.readFileSync(path.join(root, 'legal-footer.js'), 'utf8');
const mobileFixes = fs.readFileSync(path.join(root, 'mobile-fixes.css'), 'utf8');

test('legal-footer carrega a versão atual dos controles de acessibilidade', () => {
  assert.match(footer, /accessibility-controls\.js\?v=9/);
  assert.match(footer, /ensureAccessibilityControlsScript/);
});

test('desktop mantém os controles em uma barra global fixa no canto inferior esquerdo', () => {
  assert.match(controls, /reloja-accessibility-global-rail/);
  assert.match(controls, /position:fixed;left:max\(12px,env\(safe-area-inset-left\)\);bottom:max\(12px,env\(safe-area-inset-bottom\)\);top:auto/);
  assert.match(controls, /document\.body\.appendChild\(createGroup\('reloja-accessibility-global-rail'\)\)/);
});

test('cabeçalho remove apenas o controle de contraste legado', () => {
  assert.match(controls, /removeLegacyContrastButton/);
  assert.doesNotMatch(controls, /removeRedundantStoreNav/);
  assert.doesNotMatch(controls, /sobre\.html#loja/);
  assert.match(mobileFixes, /\.reloja-contrast-toggle\{[\s\S]*display:none !important/);
  assert.doesNotMatch(mobileFixes, /a\[href\$="sobre\.html#loja"\]/);
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

test('em telas menores a barra global permanece acessível e mais compacta', () => {
  assert.match(controls, /@media\(max-width:640px\)/);
  assert.match(controls, /reloja-accessibility-global-rail/);
  assert.match(controls, /width:32px;height:32px/);
});
