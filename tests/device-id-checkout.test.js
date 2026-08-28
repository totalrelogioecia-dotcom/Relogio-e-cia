const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('carrinho carrega security.js oficial antes do cliente Mercado Pago', () => {
  const html = read('carrinho.html');
  const security = html.indexOf('https://www.mercadopago.com/v2/security.js');
  const checkoutClient = html.indexOf('mercadopago-checkout-client.js');

  assert.ok(security >= 0, 'security.js oficial deve estar presente');
  assert.ok(checkoutClient > security, 'security.js deve carregar antes do cliente do checkout');
  assert.match(html, /security\.js"\s+view="checkout"/);
});

test('cliente envia device_id e backend converte para meliSessionId', () => {
  const client = read('mercadopago-checkout-client.js');
  const core = read('mercadopago-core.js');

  assert.match(client, /MP_DEVICE_SESSION_ID/);
  assert.match(client, /device_id:\s*deviceId/);
  assert.match(core, /options\.meliSessionId\s*=\s*sessionId/);
});
