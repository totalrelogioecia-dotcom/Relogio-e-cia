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
  assert.match(source, /\/api\/shipping\/quote/);
  assert.match(source, /Melhor Envio/);
});

test('retirada fica invisível fora de Porto Alegre e reaparece para endereço permitido', () => {
  const source = read('shipping-cart.js');
  const addresses = read('shipping-addresses.js');
  const cart = read('carrinho.html');

  assert.match(source, /id="shipping-pickup-options" hidden/);
  assert.match(source, /options\.hidden = !pickupAllowedForAddress/);
  assert.match(source, /options\.style\.display = pickupAllowedForAddress \? '' : 'none'/);
  assert.match(addresses, /publishAddress\(sessionAddress\(\)\)/);
  assert.match(cart, /shipping-addresses\.js\?v=pickup-6/);
  assert.match(cart, /shipping-cart\.js\?v=pickup-6/);
});

test('checkout real do Render passa pelo Mercado Pago clean', () => {
  const bootstrap = read('auth-bootstrap.js');
  assert.match(bootstrap, /registerMercadoPagoClean\(app\)/);
  assert.match(bootstrap, /registerCouponCheckout\(app\)/);
});

test('ponte envia pickup com service id e CEP antes da validação legada', () => {
  const bridge = read('pickup-checkout-bridge.js');
  assert.match(bridge, /service_id: 'pickup'/);
  assert.match(bridge, /postal_code: postalCode/);
  assert.match(bridge, /shipping-postal-code/);

  const cart = read('carrinho.html');
  const bridgeIndex = cart.indexOf('pickup-checkout-bridge.js');
  const shippingIndex = cart.indexOf('shipping-cart.js');
  assert.ok(bridgeIndex >= 0 && shippingIndex >= 0 && bridgeIndex < shippingIndex,
    'a ponte deve ser carregada antes do interceptador de frete');
});

test('serviço central trata pickup sem consultar o Melhor Envio', () => {
  const source = read('shipping-service.js');
  assert.match(source, /String\(serviceId \|\| ''\).*=== 'pickup'\) return null/);
  assert.match(source, /async function resolveSelectedShipping/);
  assert.match(source, /const result = await quoteShipping/);
});

test('entrega normal continua usando cotação e revalidação do Melhor Envio', () => {
  const source = read('shipping-service.js');
  assert.match(source, /callMelhorEnvio\('\/api\/v2\/me\/shipment\/calculate'/);
  assert.match(source, /shipping_service_changed/);
  assert.match(source, /provider: 'melhor_envio'/);
});
