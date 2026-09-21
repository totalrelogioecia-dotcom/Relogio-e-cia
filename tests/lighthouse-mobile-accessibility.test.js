const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('painel mantém destino de salto e marco principal utilizável pelo teclado', () => {
  const panel = read('accessibility-panel.js');
  execFileSync(process.execPath, ['--check', path.join(root, 'accessibility-panel.js')], { stdio: 'pipe' });
  assert.match(panel, /function ensureMainLandmark\(\)/);
  assert.match(panel, /main\.id='main-content'/);
  assert.match(panel, /setAttribute\('tabindex','-1'\)/);
  assert.match(panel, /const main=ensureMainLandmark\(\)/);
  assert.match(panel, /skip\.href=main/);
});

test('hierarquia de títulos é normalizada sem mudar o desenho visual', () => {
  const panel = read('accessibility-panel.js');
  assert.match(panel, /function normalizeHeadingOrder\(\)/);
  assert.match(panel, /footer \.footer-grid h5/);
  assert.match(panel, /store-grid \.store-cell h4/);
  assert.match(panel, /setAttribute\('aria-level'/);
  assert.match(panel, /declared>previous\+1/);
});

test('contatos, rodapé e acesso de acessibilidade têm alvos de 44px no celular', () => {
  const css = read('mobile-complete-review.css');
  const panel = read('accessibility-panel.js');
  execFileSync(process.execPath, ['--check', path.join(root, 'accessibility-panel.js')], { stdio: 'pipe' });
  assert.match(css, /\.store-cell p a,[\s\S]*\.footer-grid li a,[\s\S]*min-height:44px/);
  assert.match(panel, /nav-actions-cluster[\s\S]*min-height:44px!important/);
});
