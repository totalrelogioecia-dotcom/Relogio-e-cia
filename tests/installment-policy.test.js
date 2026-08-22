const test = require('node:test');
const assert = require('node:assert/strict');
const { maxInstallmentsForAmount } = require('../installment-policy');

test('mantém cada parcela em pelo menos R$ 50 e limita em 12x', () => {
  assert.equal(maxInstallmentsForAmount(49.99), 1);
  assert.equal(maxInstallmentsForAmount(50), 1);
  assert.equal(maxInstallmentsForAmount(99.99), 1);
  assert.equal(maxInstallmentsForAmount(100), 2);
  assert.equal(maxInstallmentsForAmount(249), 4);
  assert.equal(maxInstallmentsForAmount(250), 5);
  assert.equal(maxInstallmentsForAmount(599.99), 11);
  assert.equal(maxInstallmentsForAmount(600), 12);
  assert.equal(maxInstallmentsForAmount(1200), 12);
});
