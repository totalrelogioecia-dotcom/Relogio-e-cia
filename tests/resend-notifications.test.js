const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function waitFor(check, timeoutMs = 1500) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  throw new Error('Tempo esgotado aguardando o envio simulado do Resend.');
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('pedido e cancelamento enviam pelo Resend e persistem o identificador do provedor', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-resend-'));
  const ordersFile = path.join(tempDir, 'orders.json');
  const previous = {
    DATA_DIR: process.env.DATA_DIR,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM,
    DATABASE_URL: process.env.DATABASE_URL
  };
  const originalFetch = global.fetch;
  const calls = [];

  process.env.DATA_DIR = tempDir;
  process.env.RESEND_API_KEY = 're_test_fake_key';
  process.env.RESEND_FROM = 'Relógio e Cia <pedidos@example.com>';
  delete process.env.DATABASE_URL;

  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: `resend-test-${calls.length}` })
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

  const orders = [
    {
      id: 'PED-EMAIL-1',
      payer: { nome: 'Cliente Teste', email: 'CLIENTE@EXAMPLE.COM' },
      metodo: 'pix',
      payment_status: 'approved',
      subtotal: 100,
      desconto_pix: 5,
      total: 95,
      shipping: { price: 0 },
      items: [{ nome: 'Relógio Teste', quantidade: 1, unit_price: 100 }]
    },
    {
      id: 'PED-CANCEL-1',
      payer: { nome: 'Cliente Teste', email: 'cliente@example.com' },
      total: 200,
      store_cancellation: {
        status: 'refunded',
        reason_label: 'Produto indisponível'
      }
    }
  ];
  fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2), 'utf8');

  delete require.cache[require.resolve('../order-email')];
  const { queueOrderReceivedEmail } = require('../order-email');
  queueOrderReceivedEmail('PED-EMAIL-1');

  await waitFor(() => {
    const current = readJson(ordersFile);
    return calls.length >= 1 && Boolean(current[0]?.notifications?.order_received_email_sent_at);
  });

  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer re_test_fake_key');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  const orderPayload = JSON.parse(calls[0].options.body);
  assert.equal(orderPayload.from, 'Relógio e Cia <pedidos@example.com>');
  assert.deepEqual(orderPayload.to, ['cliente@example.com']);
  assert.match(orderPayload.subject, /PED-EMAIL-1/);
  assert.match(orderPayload.html, /Relógio Teste/);
  assert.equal(readJson(ordersFile)[0].notifications.order_received_email_provider_id, 'resend-test-1');

  delete require.cache[require.resolve('../order-cancellation-email')];
  const { queueOrderCancellationEmail } = require('../order-cancellation-email');
  queueOrderCancellationEmail('PED-CANCEL-1');

  await waitFor(() => {
    const current = readJson(ordersFile);
    return calls.length >= 2 && Boolean(current[1]?.notifications?.store_cancellation_email_sent_at);
  });

  assert.equal(calls[1].url, 'https://api.resend.com/emails');
  const cancellationPayload = JSON.parse(calls[1].options.body);
  assert.deepEqual(cancellationPayload.to, ['cliente@example.com']);
  assert.match(cancellationPayload.subject, /cancelado e reembolsado/i);
  assert.match(cancellationPayload.html, /Produto indisponível/);
  assert.equal(readJson(ordersFile)[1].notifications.store_cancellation_email_provider_id, 'resend-test-2');
});

test('recuperação de senha está preparada para Resend e integração automática do WhatsApp foi removida', () => {
  const authSource = fs.readFileSync(path.join(ROOT, 'auth.js'), 'utf8');
  const envExample = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  const orderEmailSource = fs.readFileSync(path.join(ROOT, 'order-email.js'), 'utf8');
  const cancellationEmailSource = fs.readFileSync(path.join(ROOT, 'order-cancellation-email.js'), 'utf8');

  assert.match(authSource, /RESEND_API_KEY/);
  assert.match(authSource, /RESEND_FROM/);
  assert.match(authSource, /https:\/\/api\.resend\.com\/emails/);
  assert.match(authSource, /reset_token=/);
  assert.match(authSource, /30 \* 60 \* 1000/);
  assert.match(envExample, /RESEND_API_KEY=/);
  assert.match(envExample, /RESEND_FROM=/);

  assert.equal(orderEmailSource.includes('whatsapp-notifications'), false);
  assert.equal(cancellationEmailSource.includes('whatsapp-notifications'), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'whatsapp-notifications.js')), false);
});
