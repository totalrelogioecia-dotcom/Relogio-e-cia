const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('integração usa módulo central e SDK oficial sem monkey patches', () => {
  const core = read('mercadopago-core.js');
  const bootstrap = read('auth-bootstrap.js');

  assert.match(core, /MercadoPagoConfig/);
  assert.match(core, /Preference/);
  assert.match(core, /Payment/);
  assert.match(core, /WebhookSignatureValidator/);
  assert.doesNotMatch(bootstrap, /\.prototype\.create\s*=/);
  assert.doesNotMatch(bootstrap, /WebhookSignatureValidator\.validate\s*=/);
});

test('Checkout Pro envia dados relevantes do comprador explicitamente', () => {
  const core = read('mercadopago-core.js');
  const checkout = read('mercadopago-clean.js');

  assert.match(core, /result\.phone\s*=\s*\{\s*area_code:/);
  assert.match(core, /result\.identification\s*=/);
  assert.match(core, /result\.address\s*=/);
  assert.match(core, /result\.date_created\s*=/);
  assert.match(checkout, /payer:\s*preferencePayer\(payer\)/);
});

test('Device ID vira meliSessionId no requestOptions oficial', () => {
  const core = read('mercadopago-core.js');
  assert.match(core, /options\.meliSessionId\s*=\s*sessionId/);
});

test('Checkout Pro mantém campos essenciais de preferência', () => {
  const checkout = read('mercadopago-clean.js');

  assert.match(checkout, /external_reference:\s*orderId/);
  assert.match(checkout, /back_urls:/);
  assert.match(checkout, /auto_return:\s*['"]approved['"]/);
  assert.match(checkout, /notification_url:/);
  assert.match(checkout, /statement_descriptor:\s*statementDescriptor\(\)/);
  assert.match(checkout, /payment_methods:/);
  assert.match(checkout, /installments:\s*maxInstallments/);
});

test('binary_mode não é habilitado', () => {
  const checkout = read('mercadopago-clean.js');
  const coupon = read('coupon-checkout.js');

  assert.doesNotMatch(checkout, /binary_mode\s*:\s*true/);
  assert.doesNotMatch(coupon, /binary_mode\s*:\s*true/);
});

test('Webhook usa validador do SDK e data.id da query sem reescrever assinatura', () => {
  const checkout = read('mercadopago-clean.js');

  assert.match(checkout, /WebhookSignatureValidator\.validate\(\{/);
  assert.match(checkout, /req\.query\?\.\['data\.id'\]/);
  assert.doesNotMatch(checkout, /createHmac/);
});

test('Checkout de cartão retorna preference_id e não força init_point', () => {
  const checkout = read('mercadopago-clean.js');
  const coupon = read('coupon-checkout.js');

  assert.match(checkout, /preference_id:\s*order\.preference_id/);
  assert.doesNotMatch(checkout, /sandbox_init_point/);
  assert.doesNotMatch(coupon, /sandbox_init_point/);
  assert.doesNotMatch(coupon, /init_point:\s*pref\.init_point/);
});

test('credenciais ficam em variáveis de ambiente e nunca hardcoded', () => {
  const core = read('mercadopago-core.js');

  assert.match(core, /process\.env\.MERCADOPAGO_ACCESS_TOKEN/);
  assert.match(core, /process\.env\.MERCADOPAGO_PUBLIC_KEY/);
  assert.match(core, /process\.env\.MERCADOPAGO_WEBHOOK_SECRET/);
  assert.doesNotMatch(core, /APP_USR-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(core, /TEST-[A-Za-z0-9_-]{20,}/);
});
