const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const panel = fs.readFileSync(path.join(root, 'accessibility-panel.js'), 'utf8');

test('painel oferece passos exatos de 100 a 140 por cento', () => {
  assert.match(panel, /SCALE_VALUES=Object\.freeze\(\[100,110,120,130,140\]\)/);
  assert.match(panel, /LEGACY_SCALE_MAP=new Map\(\[\[112\.5,110\],\[125,120\]\]\)/);
  assert.match(panel, /data-reloja-text-scale/);
});

test('titulos fluidos acompanham a escala em vez de travar no vw', () => {
  assert.match(panel, /5\.88vw/);
  assert.match(panel, /3\.92vw/);
  assert.match(panel, /4\.48vw/);
  assert.match(panel, /8\.4vw/);
  assert.match(panel, /14\.7vw/);
});

test('textos fixos de produto e paginas legais passam a usar rem', () => {
  assert.match(panel, /\.product-description\{font-size:1\.0625rem!important\}/);
  assert.match(panel, /\.spec-item dd\{font-size:\.875rem!important\}/);
  assert.match(panel, /\.policy-card p,\.policy-card li\{font-size:\.9375rem!important\}/);
  assert.match(panel, /\.policy-small\{font-size:\.75rem!important\}/);
});

test('campos mobile crescem acima de 100 por cento sem perder o minimo do iPhone', () => {
  assert.match(panel, /@media\(max-width:640px\)/);
  assert.match(panel, /not\(\[data-reloja-text-scale="100"\]\)[\s\S]*textarea\{font-size:1rem!important\}/);
});

test('cabecalho vira menu em 130 e 140 por cento sem cortar ações', () => {
  assert.match(panel, /data-reloja-text-scale="130"[\s\S]*flex-wrap:nowrap/);
  assert.match(panel, /data-reloja-text-scale="140"[\s\S]*nav-links\.open/);
  assert.match(panel, /data-reloja-text-scale="140"[\s\S]*nav-toggle[\s\S]*display:block/);
});
