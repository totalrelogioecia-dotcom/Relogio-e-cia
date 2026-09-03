const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { flushPersistentStore } = require('./persistent-store');
const { queueShippingEmail } = require('./shipping-email');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const ORDERS = path.join(DATA, 'orders.json');
const ALLOWED = new Set(['shipped', 'ready_for_pickup']);

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function write(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

async function persistOrders(orders) {
  write(ORDERS, orders);
  await flushPersistentStore();
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function validAdminToken(value) {
  try {
    const [body, sig] = String(value || '').split('.');
    if (!body || !sig) return false;
    const secret = String(process.env.ADMIN_SESSION_SECRET || '').trim();
    if (!secret) return false;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (!safeEqual(sig, expected)) return false;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.role === 'admin' && payload.exp > Date.now();
  } catch { return false; }
}

function admin(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!validAdminToken(token)) return res.status(401).json({ error: 'Sessão administrativa inválida ou expirada.' });
  next();
}

function text(value, max) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function isPaid(order) {
  const status = String(order?.status || '').toLowerCase();
  const payment = String(order?.payment_status || '').toLowerCase();
  return status === 'paid' || ['approved', 'processed'].includes(payment);
}

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
    return url.toString().slice(0, 1000);
  } catch {
    const error = new Error('Informe um link de rastreamento válido, começando com https://');
    error.status = 400;
    throw error;
  }
}

function registerOrderShippingRoutes(app) {
  app.use('/api/admin/orders', express.json({ limit: '64kb' }));

  app.patch('/api/admin/orders/:id/fulfillment', admin, async (req, res) => {
    try {
      const orderId = String(req.params.id || '').trim();
      const orders = read(ORDERS, []);
      const index = orders.findIndex(order => String(order?.id || '') === orderId);
      if (index < 0) return res.status(404).json({ error: 'Pedido não encontrado.' });

      const order = orders[index];
      if (!isPaid(order)) {
        return res.status(409).json({ error: 'O envio só pode ser registrado depois da confirmação do pagamento.' });
      }
      if (order?.store_cancellation?.status === 'refunded') {
        return res.status(409).json({ error: 'Este pedido foi cancelado e reembolsado.' });
      }

      const status = text(req.body?.status, 40).toLowerCase();
      if (!ALLOWED.has(status)) return res.status(400).json({ error: 'Selecione um status de envio válido.' });

      const carrier = text(req.body?.carrier, 120);
      const trackingCode = text(req.body?.tracking_code, 120);
      const trackingUrl = normalizeUrl(req.body?.tracking_url);
      const estimatedDelivery = text(req.body?.estimated_delivery, 120);

      if (status === 'shipped' && !carrier) {
        return res.status(400).json({ error: 'Informe a transportadora ou serviço usado no envio.' });
      }

      const now = new Date().toISOString();
      order.fulfillment = {
        ...(order.fulfillment || {}),
        status,
        carrier: status === 'ready_for_pickup' ? '' : carrier,
        tracking_code: status === 'ready_for_pickup' ? '' : trackingCode,
        tracking_url: status === 'ready_for_pickup' ? '' : trackingUrl,
        estimated_delivery: estimatedDelivery,
        posted_at: now,
        updated_at: now
      };
      order.updated_at = now;
      orders[index] = order;
      await persistOrders(orders);

      queueShippingEmail(orderId);
      return res.json({ ok: true, fulfillment: order.fulfillment, order_id: orderId });
    } catch (error) {
      console.error('Erro ao registrar envio do pedido:', error.message);
      return res.status(error.status || 500).json({ error: error.message || 'Não foi possível registrar o envio.' });
    }
  });
}

module.exports = { registerOrderShippingRoutes };
