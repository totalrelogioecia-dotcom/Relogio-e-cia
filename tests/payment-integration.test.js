const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Checkout Pro envia notification_url e preferência pelo SDK oficial', () => {
  const checkout = read('mercadopago-clean.js');

  assert.match(
    checkout,
    /notification_url:\s*`\$\{base\}\/api\/mercadopago\/webhook`/
  );
  assert.match(checkout, /preference\.create\(\{/);
  assert.match(checkout, /payer:\s*preferencePayer\(payer\)/);
});

test('PIX preserva notification_url, idempotência e Device ID', () => {
  const checkout = read('mercadopago-clean.js');

  assert.match(checkout, /payment_method_id:\s*['"]pix['"]/);
  assert.match(checkout, /notification_url:\s*`\$\{base\}\/api\/mercadopago\/webhook`/);
  assert.match(checkout, /idempotencyKey:\s*crypto\.randomUUID\(\)/);
  assert.match(checkout, /deviceId/);
});

test('ordem dos módulos mantém cupom, PIX e Checkout Pro', () => {
  const bootstrap = read('auth-bootstrap.js');
  const coupon = bootstrap.indexOf('registerCouponCheckout(app);');
  const pix = bootstrap.indexOf('registerMercadoPagoOrdersPix(app);');
  const card = bootstrap.indexOf('registerMercadoPagoClean(app);');

  assert.ok(coupon >= 0 && pix > coupon && card > pix);
});

test('Device ID é capturado no frontend e enviado explicitamente pelo backend', () => {
  const client = read('mercadopago-checkout-client.js');
  const core = read('mercadopago-core.js');
  const checkout = read('mercadopago-clean.js');
  const coupon = read('coupon-checkout.js');

  assert.match(client, /mercadopago\.com\/v2\/security\.js/);
  assert.match(client, /device_id:\s*deviceId/);
  assert.match(core, /options\.meliSessionId\s*=\s*sessionId/);
  assert.match(checkout, /requestOptions:\s*requestOptions\(\{/);
  assert.match(coupon, /requestOptions:\s*requestOptions\(\{/);
});

test('checkout usa a sessão e servidor bloqueia chamadas anônimas', () => {
  const client = read('mercadopago-checkout-client.js');
  const bootstrap = read('auth-bootstrap.js');

  assert.match(client, /credentials:\s*['"]same-origin['"]/);
  assert.doesNotMatch(client, /reloja_auth_token/);
  assert.doesNotMatch(client, /checkoutHeaders\.Authorization/);
  assert.match(bootstrap, /if\s*\(!user\)\s*\{/);
  assert.match(bootstrap, /code:\s*['"]authentication_required['"]/);
  assert.match(bootstrap, /error\.code\s*\|\|\s*['"]checkout_account_validation_failed['"]/);
});

test('auth bootstrap não modifica classes do SDK Mercado Pago', () => {
  const bootstrap = read('auth-bootstrap.js');

  assert.doesNotMatch(bootstrap, /Preference\.prototype/);
  assert.doesNotMatch(bootstrap, /WebhookSignatureValidator\.validate\s*=/);
  assert.doesNotMatch(bootstrap, /AsyncLocalStorage/);
});

test('página de retorno aceita external_reference e status oficiais do Checkout Pro', () => {
  const paymentPage = read('pagamento.html');

  assert.match(paymentPage, /q\.get\(['"]external_reference['"]\)/);
  assert.match(paymentPage, /q\.get\(['"]collection_status['"]\)/);
  assert.match(paymentPage, /retornoBruto\s*===\s*['"]approved['"]\s*\?\s*['"]success['"]/);
  assert.match(paymentPage, /fetch\(['"]\/api\/order\//);
});
