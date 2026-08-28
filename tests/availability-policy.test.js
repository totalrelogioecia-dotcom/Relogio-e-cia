const test = require('node:test');
const assert = require('node:assert/strict');

const {
  availabilityForProduct,
  validateCheckoutAvailability,
  shouldApplyPhysicalStock
} = require('../product-availability-service');
const { pickupAllowed, assertPickupAllowed } = require('../pickup-policy');

test('produto sob encomenda pode ser comprado sem estoque físico', () => {
  const product = { id: 10, nome: 'Casio Teste', marca: 'Casio', estoque: 0 };
  const details = { '10': { disponibilidade: 'sob_encomenda', prazo_preparacao_dias_uteis: 15 } };
  const value = validateCheckoutAvailability(product, 1, details);
  assert.equal(value.type, 'sob_encomenda');
  assert.equal(value.preparation_days, 15);
});

test('prazo de sob encomenda nunca fica abaixo de 15 dias úteis', () => {
  const product = { id: 11, nome: 'G-Shock Teste', marca: 'G-Shock', estoque: 0 };
  const details = { '11': { disponibilidade: 'sob_encomenda', prazo_preparacao_dias_uteis: 5 } };
  assert.equal(availabilityForProduct(product, details).preparation_days, 15);
});

test('pedido mediante confirmação não pode seguir para pagamento', () => {
  const product = { id: 12, nome: 'Produto limitado', marca: 'Technos', estoque: 0 };
  const details = { '12': { disponibilidade: 'mediante_confirmacao' } };
  assert.throws(
    () => validateCheckoutAvailability(product, 1, details),
    error => error?.code === 'product_confirmation_required' && error?.status === 409
  );
});

test('qualquer marca pode usar sob encomenda sem estoque físico', () => {
  const product = { id: 13, nome: 'Orient sob encomenda', marca: 'Orient', estoque: 0 };
  const details = { '13': { disponibilidade: 'sob_encomenda', prazo_preparacao_dias_uteis: 20 } };
  const value = validateCheckoutAvailability(product, 1, details);
  assert.equal(value.type, 'sob_encomenda');
  assert.equal(value.preparation_days, 20);
});

test('pronta entrega continua respeitando estoque físico em qualquer marca', () => {
  const product = { id: 14, nome: 'Citizen sem estoque', marca: 'Citizen', estoque: 0 };
  const details = { '14': { disponibilidade: 'pronta_entrega' } };
  assert.throws(
    () => validateCheckoutAvailability(product, 1, details),
    error => error?.code === 'product_stock_insufficient'
  );
});

test('estoque só é baixado para item de pronta entrega', () => {
  assert.equal(shouldApplyPhysicalStock({ disponibilidade: 'pronta_entrega' }), true);
  assert.equal(shouldApplyPhysicalStock({ disponibilidade: 'sob_encomenda' }), false);
  assert.equal(shouldApplyPhysicalStock({}), true);
});

test('retirada na loja é permitida para endereço de Porto Alegre/RS', () => {
  const payer = { endereco: { city_name: 'Porto Alegre', state_code: 'RS' } };
  assert.equal(pickupAllowed(payer), true);
  assert.equal(assertPickupAllowed(payer), true);
});

test('retirada na loja é recusada fora de Porto Alegre', () => {
  const payer = { endereco: { city_name: 'Canoas', state_code: 'RS' } };
  assert.equal(pickupAllowed(payer), false);
  assert.throws(
    () => assertPickupAllowed(payer),
    error => error?.code === 'pickup_outside_porto_alegre' && error?.status === 409
  );
});
