const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BOX_PROFILES,
  defaultBoxSizeForProduct,
  dimensionsForBox,
  orderBoxSize
} = require('../shipping-packaging');

test('perfis P M G têm as medidas definidas pela loja', () => {
  assert.deepEqual(BOX_PROFILES.P, { code: 'P', height: 10, width: 12, length: 12 });
  assert.deepEqual(BOX_PROFILES.M, { code: 'M', height: 12, width: 15, length: 15 });
  assert.deepEqual(BOX_PROFILES.G, { code: 'G', height: 24, width: 30, length: 30 });
});

test('Orient e Technos simples usam P automaticamente', () => {
  assert.equal(defaultBoxSizeForProduct({ marca: 'Orient', categoria: 'Relógios' }), 'P');
  assert.equal(defaultBoxSizeForProduct({ marca: 'Technos', categoria: 'Relógios' }), 'P');
});

test('G-Shock e Citizen usam M automaticamente', () => {
  assert.equal(defaultBoxSizeForProduct({ marca: 'G-Shock', categoria: 'Relógios' }), 'M');
  assert.equal(defaultBoxSizeForProduct({ marca: 'Citizen', categoria: 'Relógios' }), 'M');
});

test('marca ainda não medida não recebe caixa automática', () => {
  assert.equal(defaultBoxSizeForProduct({ marca: 'Casio', categoria: 'Relógios' }), '');
  assert.equal(defaultBoxSizeForProduct({ marca: 'Orient', categoria: 'Pulseiras' }), '');
});

test('override manual permite marcar relógio especial como G', () => {
  const items = [{
    product: { marca: 'Technos', categoria: 'Relógios' },
    quantity: 1,
    shipping: { box_size: 'G' }
  }];
  assert.equal(orderBoxSize(items), 'G');
  assert.deepEqual(dimensionsForBox('G'), { box_size: 'G', width: 30, height: 24, length: 30 });
});

test('mais de um relógio usa caixa G automaticamente', () => {
  const items = [
    {
      product: { marca: 'Orient', categoria: 'Relógios' },
      quantity: 1,
      shipping: {}
    },
    {
      product: { marca: 'Citizen', categoria: 'Relógios' },
      quantity: 1,
      shipping: {}
    }
  ];
  assert.equal(orderBoxSize(items), 'G');
});

test('duas unidades do mesmo relógio também usam G', () => {
  const items = [{
    product: { marca: 'G-Shock', categoria: 'Relógios' },
    quantity: 2,
    shipping: {}
  }];
  assert.equal(orderBoxSize(items), 'G');
});
