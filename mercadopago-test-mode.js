const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const ORDERS = path.join(DATA, 'orders.json');

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function write(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function mercadoPagoMode() {
  return String(process.env.MERCADOPAGO_MODE || '').trim().toLowerCase() === 'test' ? 'test' : 'production';
}

function isTestMode() {
  return mercadoPagoMode() === 'test';
}

function configureMercadoPagoEnvironment() {
  if (!isTestMode()) return;

  const testToken = String(process.env.MERCADOPAGO_TEST_ACCESS_TOKEN || '').trim();
  if (testToken) {
    process.env.MERCADOPAGO_ACCESS_TOKEN = testToken;
  } else {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    console.warn('Mercado Pago em modo TESTE, mas MERCADOPAGO_TEST_ACCESS_TOKEN não está configurado.');
  }

  if (process.env.MERCADOPAGO_TEST_WEBHOOK_SECRET) {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = process.env.MERCADOPAGO_TEST_WEBHOOK_SECRET;
  }
}

function patchPreferenceForSandbox() {
  if (Preference.prototype.__relogioSandboxPatched) return;

  const originalCreate = Preference.prototype.create;
  Preference.prototype.create = async function patchedCreate(...args) {
    const data = await originalCreate.apply(this, args);
    if (isTestMode() && data?.sandbox_init_point) {
      return { ...data, init_point: data.sandbox_init_point };
    }
    return data;
  };

  Preference.prototype.__relogioSandboxPatched = true;
}

function paymentClient() {
  const access = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!access) throw new Error('MERCADOPAGO_TEST_ACCESS_TOKEN não configurado para o modo de teste.');
  const client = new MercadoPagoConfig({ accessToken: access, options: { timeout: 10000, maxRetries: 2 } });
  return new Payment(client);
}

function paymentSafe(payment) {
  return {
    id: payment?.id ? String(payment.id) : null,
    status: payment?.status ? String(payment.status) : null,
    status_detail: payment?.status_detail ? String(payment.status_detail) : null,
    payment_method_id: payment?.payment_method_id ? String(payment.payment_method_id) : null,
    payment_type_id: payment?.payment_type_id ? String(payment.payment_type_id) : null,
    operation_type: payment?.operation_type ? String(payment.operation_type) : null,
    transaction_amount: Number.isFinite(Number(payment?.transaction_amount)) ? Number(payment.transaction_amount) : null,
    installments: Number.isFinite(Number(payment?.installments)) ? Number(payment.installments) : null,
    external_reference: payment?.external_reference ? String(payment.external_reference) : null,
    date_created: payment?.date_created ? String(payment.date_created) : null,
    date_approved: payment?.date_approved ? String(payment.date_approved) : null,
    date_last_updated: payment?.date_last_updated ? String(payment.date_last_updated) : null,
    live_mode: typeof payment?.live_mode === 'boolean' ? payment.live_mode : null
  };
}

function statusPedido(status) {
  if (status === 'approved') return 'paid';
  if (status === 'rejected') return 'rejected';
  if (status === 'cancelled') return 'cancelled';
  return 'pending';
}

function markOrderAsTest(orderId) {
  if (!orderId) return;
  const orders = read(ORDERS, []);
  const index = orders.findIndex(order => String(order.id) === String(orderId));
  if (index < 0) return;

  orders[index].test_mode = true;
  orders[index].mercadopago_mode = 'test';
  orders[index].stock_applied = false;
  orders[index].updated_at = new Date().toISOString();
  write(ORDERS, orders);
}

function applyTestPayment(payment) {
  const orderId = String(payment?.external_reference || '');
  if (!orderId) return null;

  const orders = read(ORDERS, []);
  const index = orders.findIndex(order => String(order.id) === orderId);
  if (index < 0) return null;

  const order = orders[index];
  order.test_mode = true;
  order.mercadopago_mode = 'test';
  order.payment_id = String(payment.id || '');
  order.payment_status = String(payment.status || 'pending');
  order.status = statusPedido(payment.status);
  order.payment_detail = paymentSafe(payment);
  order.stock_applied = false;
  order.updated_at = new Date().toISOString();
  write(ORDERS, orders);

  console.log('Mercado Pago TESTE atualizado sem baixa de estoque:', {
    orderId,
    payment_id: order.payment_id,
    payment_status: order.payment_status,
    status_detail: order.payment_detail?.status_detail || null
  });

  return order;
}

async function findPaymentForOrder(order) {
  const payment = paymentClient();
  if (order.payment_id) return payment.get({ id: String(order.payment_id) });

  const data = await payment.search({
    options: {
      external_reference: String(order.id),
      sort: 'date_created',
      criteria: 'desc',
      limit: 1
    }
  });
  return Array.isArray(data?.results) && data.results.length ? data.results[0] : null;
}

function parseSignature(signature) {
  const result = {};
  for (const part of String(signature || '').split(',')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (key && value) result[key] = value;
  }
  return result;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function validateWebhook(req) {
  const secret = String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();
  const signature = String(req.get('x-signature') || '').trim();
  const requestId = String(req.get('x-request-id') || '').trim();
  const dataIdRaw = String(req.query['data.id'] || req.body?.data?.id || '').trim();
  if (!secret || !signature || !dataIdRaw) return false;

  const parts = parseSignature(signature);
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !/^\d+$/.test(ts) || !/^[a-f0-9]{64}$/i.test(v1)) return false;

  const timestamp = Number(ts);
  const timestampMs = ts.length >= 13 ? timestamp : timestamp * 1000;
  if (!Number.isFinite(timestampMs)) return false;
  const toleranceSeconds = Math.max(0, Number(process.env.MERCADOPAGO_WEBHOOK_TOLERANCE_SECONDS || 300));
  if (toleranceSeconds && Math.abs(Date.now() - timestampMs) > toleranceSeconds * 1000) return false;

  const manifest = `id:${dataIdRaw.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest, 'utf8').digest('hex');
  return safeEqual(expected, v1.toLowerCase());
}

function registerMercadoPagoTestMode(app) {
  patchPreferenceForSandbox();
  app.use('/api/mercadopago/webhook', require('express').json({ limit: '1mb' }));

  app.get('/api/mercadopago/mode', (req, res) => {
    const mode = mercadoPagoMode();
    res.set('Cache-Control', 'no-store');
    res.json({
      mode,
      test: mode === 'test',
      token_configured: Boolean(String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim())
    });
  });

  app.use('/api/checkout', (req, res, next) => {
    if (!isTestMode() || req.method !== 'POST') return next();

    const originalJson = res.json.bind(res);
    res.json = body => {
      try {
        if (body?.order_id) markOrderAsTest(body.order_id);
      } catch (error) {
        console.warn('Não foi possível marcar o pedido como teste:', error.message);
      }
      return originalJson(body);
    };
    next();
  });

  app.post('/api/mercadopago/webhook', async (req, res, next) => {
    if (!isTestMode()) return next();

    const paymentId = String(req.body?.data?.id || req.query['data.id'] || '').trim();
    if (!paymentId) return res.sendStatus(200);
    if (!validateWebhook(req)) {
      console.warn('Mercado Pago TESTE webhook recusado: assinatura inválida.', { paymentId });
      return res.sendStatus(401);
    }

    try {
      const payment = await paymentClient().get({ id: paymentId });
      applyTestPayment(payment);
      return res.sendStatus(200);
    } catch (error) {
      console.error('Mercado Pago TESTE webhook:', { paymentId, message: error.message || String(error) });
      return res.sendStatus(500);
    }
  });

  app.get('/api/order/:id', async (req, res, next) => {
    if (!isTestMode()) return next();

    let order = read(ORDERS, []).find(item => String(item.id) === String(req.params.id));
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

    if (order.status === 'pending' || order.payment_status === 'pending') {
      try {
        const payment = await findPaymentForOrder(order);
        if (payment) order = applyTestPayment(payment) || order;
      } catch (error) {
        console.warn('Mercado Pago TESTE: não foi possível sincronizar pedido.', {
          orderId: order.id,
          message: error.message || String(error)
        });
      }
    }

    res.set('Cache-Control', 'no-store');
    return res.json({
      id: order.id,
      status: order.status,
      payment_status: order.payment_status,
      payment_id: order.payment_id || null,
      metodo: order.metodo || null,
      pix: order.pix || null,
      payment_detail: order.payment_detail || null,
      test_mode: true,
      updated_at: order.updated_at || null
    });
  });
}

module.exports = {
  configureMercadoPagoEnvironment,
  registerMercadoPagoTestMode,
  mercadoPagoMode,
  isTestMode
};
