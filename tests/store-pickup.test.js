const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('carrinho oferece retirada na loja grátis sem remover o Melhor Envio', () => {
  const source = read('shipping-cart.js');
  assert.match(source, /Retirar na loja/);
  assert.match(source, /Av\. Cristóvão Colombo, 545/);
  assert.match(source, /mode: 'pickup'/);
  assert.match(source, /price: 0/);
  assert.match(source, /body\.shipping = \{ mode: 'pickup' \}/);
  assert.match(source, /\/api\/shipping\/quote/);
  assert.match(source, /Melhor Envio/);
});

test('servidor aceita retirada sem consultar frete e não envia shipments ao Mercado Pago', () => {
  const source = read('checkout-with-shipping.js');
  assert.match(source, /function isStorePickup/);
  assert.match(source, /String\(shipping\?\.mode \|\| ''\).*=== 'pickup'/);
  assert.match(source, /function storePickupShipping/);
  assert.match(source, /service_name: 'Retirada na loja'/);
  assert.match(source, /price: 0/);
  assert.match(source, /if \(pickup\) \{\s*shipping = storePickupShipping\(\);/s);
  assert.match(source, /else \{[\s\S]*resolveSelectedShipping/);
  assert.match(source, /if \(!pickup\) \{\s*preferenceBody\.shipments =/s);
});

test('entrega normal continua exigindo seleção quando configurada', () => {
  const source = read('checkout-with-shipping.js');
  assert.match(source, /if \(!pickup && \(!shippingRequest\?\.service_id \|\| !shippingRequest\?\.postal_code\)\)/);
  assert.match(source, /shippingRequired\(\) && isConfigured\(\)/);
  assert.match(source, /resolveSelectedShipping/);
});
