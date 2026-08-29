const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  WATCH_WEIGHT_STANDARDS_KG,
  defaultBoxSizeForProduct
} = require('../shipping-packaging');

const source = fs.readFileSync(path.join(__dirname, '..', 'admin-shipping.js'), 'utf8');

function uiWeightsFromSource() {
  const block = source.match(/const WEIGHT_STANDARDS_KG = Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(block, 'Admin deve declarar os pesos automáticos visíveis');
  const values = {};
  for (const match of block[1].matchAll(/([a-z_]+):\s*([0-9.]+)/g)) {
    values[match[1]] = Number(match[2]);
  }
  return values;
}

test('Admin mostra os mesmos pesos padrão usados pelo servidor', () => {
  assert.deepEqual(uiWeightsFromSource(), WATCH_WEIGHT_STANDARDS_KG);
});

test('Admin inclui Casio na caixa P automática', () => {
  assert.equal(defaultBoxSizeForProduct({ marca: 'Casio', categoria: 'Relógios' }), 'P');
  assert.match(source, /if \(brand === 'casio'\) return 'P';/);
});

test('peso automático é exibido como regra da marca sem ser persistido como manual', () => {
  assert.match(source, /input\.dataset\.weightSource = 'brand_standard'/);
  assert.match(source, /weight_kg: automaticWeight \? null : Number\(weightInput\?\.value\)/);
  assert.match(source, /Automático pela marca:/);
  assert.match(source, /shipping-weight-help/);
});

test('Technos Titanium possui padrão visual separado', () => {
  assert.equal(WATCH_WEIGHT_STANDARDS_KG.technos_titanium, 0.75);
  assert.match(source, /haystack\.includes\('titanium'\) \|\| haystack\.includes\('titanio'\)/);
  assert.match(source, /return 'Technos Titanium';/);
});
