const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function fresh(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

test('NF-e, envio e pós-venda disparam Resend e gravam marcadores idempotentes', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-operational-'));
  const ordersFile = path.join(tempDir, 'orders.json');
  const requestsFile = path.join(tempDir, 'return-requests.json');
  const previous = {
    DATA_DIR: process.env.DATA_DIR,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM,
    DATABASE_URL: process.env.DATABASE_URL
  };
  const originalFetch = global.fetch;
  const calls = [];

  process.env.DATA_DIR = tempDir;
  process.env.RESEND_API_KEY = 're_test_operational';
  process.env.RESEND_FROM = 'Relógio e Cia <pedidos@example.com>';
  delete process.env.DATABASE_URL;

  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: `operational-${calls.length}` })
    };
  };

  t.after(() => {
    global.fetch = originalFetch;
    restoreEnv('DATA_DIR', previous.DATA_DIR);
    restoreEnv('RESEND_API_KEY', previous.RESEND_API_KEY);
    restoreEnv('RESEND_FROM', previous.RESEND_FROM);
    restoreEnv('DATABASE_URL', previous.DATABASE_URL);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  fs.writeFileSync(ordersFile, JSON.stringify([{
    id: 'PED-OPS-1',
    payer: { nome: 'Cliente Operacional', email: 'cliente@example.com' },
    payment_status: 'approved',
    status: 'paid',
    total: 899.9,
    invoice: {
      status: 'emitted',
      number: '12345',
      access_key: '12345678901234567890123456789012345678901234'
    },
    fulfillment: {
      status: 'shipped',
      carrier: 'Transportadora Teste',
      tracking_code: 'ABC123BR',
      tracking_url: 'https://rastreamento.example.com/ABC123BR',
      estimated_delivery: '3 a 5 dias úteis',
      posted_at: new Date().toISOString()
    }
  }], null, 2), 'utf8');

  const { sendInvoiceEmail } = fresh('../invoice-email');
  await sendInvoiceEmail('PED-OPS-1');
  assert.equal(calls.length, 1);
  const invoicePayload = JSON.parse(calls[0].options.body);
  assert.match(invoicePayload.subject, /Nota fiscal/);
  assert.match(invoicePayload.html, /12345/);
  assert.match(invoicePayload.html, /12345678901234567890123456789012345678901234/);
  assert.ok(readJson(ordersFile)[0].notifications.invoice_email_sent_at);

  const { sendShippingEmail } = fresh('../shipping-email');
  await sendShippingEmail('PED-OPS-1');
  assert.equal(calls.length, 2);
  const shippingPayload = JSON.parse(calls[1].options.body);
  assert.match(shippingPayload.subject, /foi enviado/i);
  assert.match(shippingPayload.html, /ABC123BR/);
  assert.match(shippingPayload.html, /Transportadora Teste/);
  assert.ok(readJson(ordersFile)[0].notifications.shipping_email_sent_at);

  fs.writeFileSync(requestsFile, JSON.stringify([{
    protocol: 'ATD-20260903-ABC123',
    order_id: 'PED-OPS-1',
    customer_name: 'Cliente Operacional',
    email: 'cliente@example.com',
    type: 'garantia',
    reason: 'Produto apresentou defeito',
    status: 'recebida',
    admin_note: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }], null, 2), 'utf8');

  const { sendReceivedEmail, sendStatusEmail } = fresh('../return-request-email');
  await sendReceivedEmail('ATD-20260903-ABC123');
  assert.equal(calls.length, 3);
  const receivedPayload = JSON.parse(calls[2].options.body);
  assert.match(receivedPayload.html, /2 dias úteis/);
  assert.match(receivedPayload.html, /ATD-20260903-ABC123/);
  assert.ok(readJson(requestsFile)[0].notifications.received_email_sent_at);

  const requests = readJson(requestsFile);
  requests[0].status = 'aprovada';
  requests[0].admin_note = 'Leve o relógio e o certificado de garantia até a loja.';
  fs.writeFileSync(requestsFile, JSON.stringify(requests, null, 2), 'utf8');

  await sendStatusEmail('ATD-20260903-ABC123', 'aprovada');
  assert.equal(calls.length, 4);
  const updatePayload = JSON.parse(calls[3].options.body);
  assert.match(updatePayload.subject, /Aprovada/);
  assert.match(updatePayload.html, /certificado de garantia/);
  assert.ok(readJson(requestsFile)[0].notifications.status_aprovada_email_sent_at);
});

test('pedido pendente não gera confirmação de pagamento', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-pending-email-'));
  const ordersFile = path.join(tempDir, 'orders.json');
  const previousDir = process.env.DATA_DIR;
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM;
  const originalFetch = global.fetch;
  let calls = 0;

  process.env.DATA_DIR = tempDir;
  process.env.RESEND_API_KEY = 're_test_pending';
  process.env.RESEND_FROM = 'Relógio e Cia <pedidos@example.com>';
  global.fetch = async () => { calls += 1; return { ok: true, status: 200, json: async () => ({ id: 'should-not-send' }) }; };
  fs.writeFileSync(ordersFile, JSON.stringify([{
    id: 'PED-PENDING-1',
    payer: { nome: 'Cliente', email: 'cliente@example.com' },
    status: 'pending',
    payment_status: 'pending',
    total: 100
  }], null, 2), 'utf8');

  t.after(() => {
    global.fetch = originalFetch;
    restoreEnv('DATA_DIR', previousDir);
    restoreEnv('RESEND_API_KEY', previousKey);
    restoreEnv('RESEND_FROM', previousFrom);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const { sendPaymentApprovedEmail } = fresh('../order-email');
  await sendPaymentApprovedEmail('PED-PENDING-1');
  assert.equal(calls, 0);
  assert.equal(Boolean(readJson(ordersFile)[0].notifications), false);
});
