const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BOX_PROFILES,
  WATCH_WEIGHT_STANDARDS_KG,
  defaultShippingWeightKg,
  defaultBoxSizeForProduct,
  dimensionsForBox,
  orderBoxSize
} = require('../shipping-packaging');

test('perfis P M G têm as medidas definidas pela loja', () => {
  assert.deepEqual(BOX_PROFILES.P, { code: 'P', height: 10, width: 12, length: 12 });
  assert.deepEqual(BOX_PROFILES.M, { code: 'M', height: 12, width: 15, length: 15 });
  assert.deepEqual(BOX_PROFILES.G, { code: 'G', height: 24, width: 30, length: 30 });
});

test('pesos padrão conservadores por marca ficam fixos', () => {
  assert.deepEqual(WATCH_WEIGHT_STANDARDS_KG, {
    casio: 0.5,
    gshock: 0.6,
    technos: 0.6,
    technos_titanium: 0.75,
    orient: 0.5,
    citizen: 0.8
  });
});

test('peso padrão distingue Technos simples de Titanium', () => {
  assert.equal(defaultShippingWeightKg({ marca: 'Technos', categoria: 'Relógios', nome: 'Technos Steel' }), 0.6);
  assert.equal(defaultShippingWeightKg({ marca: 'Technos', categoria: 'Relógios', nome: 'Technos Titanium' }), 0.75);
  assert.equal(defaultShippingWeightKg({ marca: 'Technos', categoria: 'Relógios', desc: 'Caixa em titânio' }), 0.75);
});

test('peso padrão vale somente para relógios das marcas configuradas', () => {
  assert.equal(defaultShippingWeightKg({ marca: 'Casio', categoria: 'Relógios' }), 0.5);
  assert.equal(defaultShippingWeightKg({ marca: 'G-Shock', categoria: 'Relógios' }), 0.6);
  assert.equal(defaultShippingWeightKg({ marca: 'Orient', categoria: 'Relógios' }), 0.5);
  assert.equal(defaultShippingWeightKg({ marca: 'Citizen', categoria: 'Relógios' }), 0.8);
  assert.equal(defaultShippingWeightKg({ marca: 'G-Shock', categoria: 'Pulseiras' }), null);
  assert.equal(defaultShippingWeightKg({ marca: 'Outra marca', categoria: 'Relógios' }), null);
});

test('Orient, Technos simples e Casio usam P automaticamente', () => {
  assert.equal(defaultBoxSizeForProduct({ marca: 'Orient', categoria: 'Relógios' }), 'P');
  assert.equal(defaultBoxSizeForProduct({ marca: 'Technos', categoria: 'Relógios' }), 'P');
  assert.equal(defaultBoxSizeForProduct({ marca: 'Casio', categoria: 'Relógios' }), 'P');
});

test('G-Shock e Citizen usam M automaticamente', () => {
  assert.equal(defaultBoxSizeForProduct({ marca: 'G-Shock', categoria: 'Relógios' }), 'M');
  assert.equal(defaultBoxSizeForProduct({ marca: 'Citizen', categoria: 'Relógios' }), 'M');
});

test('marca ainda não medida não recebe caixa automática', () => {
  assert.equal(defaultBoxSizeForProduct({ marca: 'Outra marca', categoria: 'Relógios' }), '');
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
