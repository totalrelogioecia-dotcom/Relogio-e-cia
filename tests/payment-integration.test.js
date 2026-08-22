const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Checkout Pro preserva notification_url no corpo da preferência', () => {
  const auth = read('auth-bootstrap.js');
  const checkout = read('mercadopago-clean.js');

  assert.doesNotMatch(
    auth,
    /delete\s+body\.notification_url/,
    'auth-bootstrap.js não pode remover notification_url'
  );
  assert.match(
    checkout,
    /notification_url:\s*\`\$\{base\}\/api\/mercadopago\/webhook\`/,
    'Checkout Pro precisa enviar a URL do webhook'
  );
});

test('PIX continua enviando notification_url e chave de idempotência', () => {
  const checkout = read('mercadopago-clean.js');

  assert.match(checkout, /payment_method_id:\s*['"]pix['"]/);
  assert.match(checkout, /notification_url:\s*\`\$\{base\}\/api\/mercadopago\/webhook\`/);
  assert.match(checkout, /idempotencyKey:\s*crypto\.randomUUID\(\)/);
});

test('ordem dos módulos mantém cupom, PIX e Checkout Pro', () => {
  const bootstrap = read('auth-bootstrap.js');
  const coupon = bootstrap.indexOf('registerCouponCheckout(app);');
  const pix = bootstrap.indexOf('registerMercadoPagoOrdersPix(app);');
  const card = bootstrap.indexOf('registerMercadoPagoClean(app);');

  assert.ok(coupon >= 0 && pix > coupon && card > pix);
});

test('Device ID é capturado e enviado pelo SDK oficial', () => {
  const client = read('mercadopago-checkout-client.js');
  const bootstrap = read('auth-bootstrap.js');

  assert.match(client, /mercadopago\.com\/v2\/security\.js/);
  assert.match(client, /device_id:\s*deviceId/);
  assert.match(bootstrap, /meliSessionId:\s*deviceId/);
  assert.match(bootstrap, /mercadoPagoDeviceId\(req\.body\?\.device_id\)/);
});

test('checkout envia a sessão e o servidor bloqueia chamadas anônimas', () => {
  const client = read('mercadopago-checkout-client.js');
  const bootstrap = read('auth-bootstrap.js');

  assert.match(client, /checkoutHeaders\.Authorization\s*=\s*`Bearer/);
  assert.match(bootstrap, /if\s*\(!user\)\s*\{/);
  assert.match(bootstrap, /code:\s*['"]authentication_required['"]/);
  assert.match(bootstrap, /code:\s*['"]checkout_account_validation_failed['"]/);
});
