const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-shipping-'));
process.env.DATA_DIR = dataDir;

fs.writeFileSync(path.join(dataDir, 'products.json'), JSON.stringify([
  { id: 1, nome: 'Orient Teste', marca: 'Orient', categoria: 'Relógios', preco: 500, sku: 'ORI-1', ativo: true },
  { id: 2, nome: 'Citizen Teste', marca: 'Citizen', categoria: 'Relógios', preco: 700, sku: 'CIT-1', ativo: true },
  { id: 3, nome: 'Casio Teste', marca: 'Casio', categoria: 'Relógios', preco: 300, sku: 'CAS-1', ativo: true },
  { id: 4, nome: 'Technos Especial', marca: 'Technos', categoria: 'Relógios', preco: 900, sku: 'TEC-E', ativo: true }
], null, 2));

fs.writeFileSync(path.join(dataDir, 'shipping-products.json'), JSON.stringify({
  1: { weight_kg: 0.35 },
  2: { weight_kg: 0.45 },
  3: { weight_kg: 0.25, width_cm: 11, height_cm: 8, length_cm: 14 },
  4: { weight_kg: 0.60, box_size: 'G' }
}, null, 2));

const { buildShipment } = require('../shipping-service');

test.after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('um Orient usa um único volume P', () => {
  const shipment = buildShipment([{ id: 1, qtd: 1 }]);
  assert.equal(shipment.box_size, 'P');
  assert.deepEqual(shipment.payload.volumes, [{
    width: 12,
    height: 10,
    length: 12,
    weight: 0.35,
    insurance: 500
  }]);
});

test('dois relógios são consolidados em um único volume G', () => {
  const shipment = buildShipment([{ id: 1, qtd: 1 }, { id: 2, qtd: 1 }]);
  assert.equal(shipment.box_size, 'G');
  assert.deepEqual(shipment.payload.volumes, [{
    width: 30,
    height: 24,
    length: 30,
    weight: 0.8,
    insurance: 1200
  }]);
});

test('duas unidades do mesmo relógio também viram um volume G', () => {
  const shipment = buildShipment([{ id: 1, qtd: 2 }]);
  assert.equal(shipment.box_size, 'G');
  assert.deepEqual(shipment.payload.volumes, [{
    width: 30,
    height: 24,
    length: 30,
    weight: 0.7,
    insurance: 1000
  }]);
});

test('marca ainda sem caixa definida preserva o cálculo manual por produto', () => {
  const shipment = buildShipment([{ id: 3, qtd: 1 }]);
  assert.equal(shipment.box_size, null);
  assert.deepEqual(shipment.payload.products, [{
    id: 'CAS-1',
    width: 11,
    height: 8,
    length: 14,
    weight: 0.25,
    insurance_value: 300,
    quantity: 1
  }]);
});

test('override manual G vence a regra automática da marca', () => {
  const shipment = buildShipment([{ id: 4, qtd: 1 }]);
  assert.equal(shipment.box_size, 'G');
  assert.deepEqual(shipment.payload.volumes, [{
    width: 30,
    height: 24,
    length: 30,
    weight: 0.6,
    insurance: 900
  }]);
});
