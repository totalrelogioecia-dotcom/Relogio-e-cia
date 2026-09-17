const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const enhancement = fs.readFileSync(path.join(root, 'accessibility-trigger-enhancement.js'), 'utf8');

test('painel oferece passos exatos de 100 a 140 por cento', () => {
  assert.match(enhancement, /SCALE_VALUES=Object\.freeze\(\[100,110,120,130,140\]\)/);
  assert.match(enhancement, /LEGACY_SCALE_MAP=new Map\(\[\[112\.5,110\],\[125,120\]\]\)/);
  assert.match(enhancement, /data-reloja-text-scale/);
});

test('titulos fluidos acompanham a escala em vez de travar no vw', () => {
  assert.match(enhancement, /5\.88vw/);
  assert.match(enhancement, /3\.92vw/);
  assert.match(enhancement, /4\.48vw/);
  assert.match(enhancement, /8\.4vw/);
  assert.match(enhancement, /14\.7vw/);
});

test('textos fixos de produto e paginas legais passam a usar rem', () => {
  assert.match(enhancement, /\.product-description\{font-size:1\.0625rem!important\}/);
  assert.match(enhancement, /\.spec-item dd\{font-size:\.875rem!important\}/);
  assert.match(enhancement, /\.policy-card p,\.policy-card li\{font-size:\.9375rem!important\}/);
  assert.match(enhancement, /\.policy-small\{font-size:\.75rem!important\}/);
});

test('campos mobile crescem acima de 100 por cento sem perder o minimo do iPhone', () => {
  assert.match(enhancement, /@media\(max-width:640px\)/);
  assert.match(enhancement, /not\(\[data-reloja-text-scale="100"\]\)[\s\S]*textarea\{font-size:1rem!important\}/);
});

test('cabecalho vira menu em 130 e 140 por cento sem cortar ações', () => {
  assert.match(enhancement, /data-reloja-text-scale="130"[\s\S]*flex-wrap:nowrap/);
  assert.match(enhancement, /data-reloja-text-scale="140"[\s\S]*nav-links\.open/);
  assert.match(enhancement, /data-reloja-text-scale="140"[\s\S]*nav-toggle[\s\S]*display:block/);
  assert.doesNotMatch(enhancement, /flex-wrap:wrap/);
});
