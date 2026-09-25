const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const panel = fs.readFileSync(path.join(root, 'accessibility-panel.js'), 'utf8');
const footer = fs.readFileSync(path.join(root, 'legal-footer.js'), 'utf8');
const mobileFixes = fs.readFileSync(path.join(root, 'mobile-fixes.css'), 'utf8');

test('legal-footer carrega somente o painel consolidado de acessibilidade', () => {
  assert.match(footer, /accessibility-panel\.js\?v=5/);
  assert.match(footer, /ensureAccessibilityPanelScript/);
  assert.doesNotMatch(footer, /accessibility-controls\.js/);
});

test('painel consolidado mantém contraste, tema, escala e preferências persistidas', () => {
  assert.match(panel, /reloja_high_contrast/);
  assert.match(panel, /reloja_dark_mode/);
  assert.match(panel, /reloja_text_scale/);
  assert.match(panel, /localStorage\.setItem/);
  assert.match(panel, /Alto contraste/);
  assert.match(panel, /Modo escuro/);
  assert.match(panel, /Tamanho do texto/);
  assert.match(panel, /html\.reloja-dark img\{filter:none\}/);
});

test('painel remove controles legados sem remover links da loja', () => {
  assert.match(panel, /function removeLegacy\(\)/);
  assert.match(panel, /reloja-accessibility-global-rail/);
  assert.match(mobileFixes, /\.reloja-contrast-toggle\{[\s\S]*display:none !important/);
  assert.doesNotMatch(mobileFixes, /a\[href\$="sobre\.html#loja"\]/);
});

test('gatilho consolidado permanece acessível no cabeçalho e no mobile', () => {
  assert.match(panel, /className='reloja-a11y-trigger'/);
  assert.match(panel, /aria-label','Abrir painel de acessibilidade/);
  assert.match(panel, /viewBox="0 0 48 48"/);
  assert.match(panel, /reloja-a11y-node/);
  assert.match(panel, /fill:#4cc9f0/);
  ['contrast','dark','scale','readable','spacing','links'].forEach(icon => {
    assert.match(panel, new RegExp(`data-a11y-icon="${icon}"`));
  });
  assert.match(panel, /class="reloja-a11y-copy"/);
  assert.match(panel, /reloja-floating-utilities/);
  assert.match(panel, /COOKIE_FLOATING_SELECTORS/);
  assert.match(panel, /syncFloatingOffset/);
  assert.match(panel, /@media\(max-width:640px\)/);
  assert.match(panel, /min-width:44px!important/);
});
