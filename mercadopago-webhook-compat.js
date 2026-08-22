const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const ORDERS = path.join(DATA, 'orders.json');
const PRODUCTS = path.join(DATA, 'products.json');

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function write(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
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
function validateWebhook(req) {
  const secret = String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();
  const signature = String(req.get('x-signature') || '').trim();
  const requestId = String(req.get('x-request-id') || '').trim();
  const dataIdRaw = String(req.query['data.id'] || '').trim();
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
function statusPedido(status) {
  if (status === 'approved') return 'paid';
  if (status === 'rejected') return 'rejected';
  if (status === 'cancelled') return 'cancelled';
  return 'pending';
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
function sdkPayment() {
  const access = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!access) throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado.');
  const client = new MercadoPagoConfig({ accessToken: access, options: { timeout: 10000, maxRetries: 2 } });
  return new Payment(client);
}
function applyPayment(payment) {
  const orderId = String(payment?.external_reference || '');
  if (!orderId) return null;

  const orders = read(ORDERS, []);
  const index = orders.findIndex(o => o.id === orderId);
  if (index < 0) return null;

  const order = orders[index];
  order.payment_id = String(payment.id || '');
  order.payment_status = String(payment.status || 'pending');
  order.status = statusPedido(payment.status);
  order.payment_detail = paymentSafe(payment);
  order.updated_at = new Date().toISOString();

  if (payment.status === 'approved' && !order.stock_applied) {
    const products = read(PRODUCTS, []);
    for (const item of order.items || []) {
      const pi = products.findIndex(p => Number(p.id) === Number(item.id));
      if (pi >= 0) products[pi].estoque = Math.max(0, Number(products[pi].estoque) - Number(item.quantidade));
    }
    write(PRODUCTS, products);
    order.stock_applied = true;
  }

  write(ORDERS, orders);
  console.log('Mercado Pago webhook compatível processado:', {
    orderId,
    payment_id: order.payment_id,
    payment_status: order.payment_status,
    status_detail: order.payment_detail?.status_detail || null
  });
  return order;
}

function registerMercadoPagoWebhookCompat(app) {
  app.post('/api/mercadopago/webhook', async (req, res, next) => {
    const type = String(req.body?.type || req.body?.topic || req.query?.type || req.query?.topic || '').trim().toLowerCase();
    const paymentId = String(req.body?.data?.id || req.query['data.id'] || '').trim();

    // Notificações normais com type=payment continuam sendo tratadas pela integração principal.
    if (type === 'payment' || !paymentId) return next();

    // Só trata a variação observada em produção: data.id presente, porém type ausente.
    if (type) return next();
    if (!validateWebhook(req)) {
      console.warn('Mercado Pago webhook sem type ignorado: assinatura inválida.', { paymentId });
      return res.sendStatus(401);
    }

    try {
      const payment = await sdkPayment().get({ id: paymentId });
      applyPayment(payment);
      return res.sendStatus(200);
    } catch (error) {
      console.error('Mercado Pago webhook sem type:', { paymentId, message: error.message || String(error) });
      return res.sendStatus(500);
    }
  });
}

module.exports = { registerMercadoPagoWebhookCompat };

