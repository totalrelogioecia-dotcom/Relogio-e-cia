const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const PRODUCTS = path.join(DATA, 'products.json');
const ORDERS = path.join(DATA, 'orders.json');

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
    transaction_amount_refunded: Number.isFinite(Number(payment?.transaction_amount_refunded)) ? Number(payment.transaction_amount_refunded) : null,
    currency_id: payment?.currency_id ? String(payment.currency_id) : null,
    installments: Number.isFinite(Number(payment?.installments)) ? Number(payment.installments) : null,
    issuer_id: payment?.issuer_id ? String(payment.issuer_id) : null,
    external_reference: payment?.external_reference ? String(payment.external_reference) : null,
    date_created: payment?.date_created ? String(payment.date_created) : null,
    date_approved: payment?.date_approved ? String(payment.date_approved) : null,
    date_last_updated: payment?.date_last_updated ? String(payment.date_last_updated) : null,
    live_mode: typeof payment?.live_mode === 'boolean' ? payment.live_mode : null
  };
}

function normalizeCartItems(items) {
  if (!Array.isArray(items) || !items.length) throw Object.assign(new Error('Carrinho vazio.'), { status: 400 });
  const products = read(PRODUCTS, []);
  return items.map(raw => {
    const product = products.find(p => Number(p.id) === Number(raw.id) && p.ativo !== false);
    const qtd = Math.max(1, Math.min(99, Number(raw.qtd) || 1));
    if (!product) throw Object.assign(new Error('Produto não encontrado.'), { status: 400 });
    if (Number(product.estoque) < qtd) throw Object.assign(new Error(`Estoque insuficiente para ${product.nome}.`), { status: 400 });
    return {
      id: Number(product.id),
      nome: String(product.nome || 'Produto'),
      sku: String(product.sku || ''),
      quantidade: qtd,
      unit_price: Number(product.preco),
      foto: Array.isArray(product.fotos) ? (product.fotos.find(Boolean) || null) : null
    };
  });
}

async function mpRequest(url, options = {}) {
  const access = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!access) throw Object.assign(new Error('MERCADOPAGO_ACCESS_TOKEN não configurado.'), { status: 503 });
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${access}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error(data?.message || `Mercado Pago respondeu ${response.status}.`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function createCheckoutPro({ orderId, items, payerEmail, base }) {
  const body = {
    items: items.map(item => ({
      id: String(item.id),
      title: item.nome.slice(0, 256),
      quantity: item.quantidade,
      currency_id: 'BRL',
      unit_price: Number(item.unit_price.toFixed(2))
    })),
    payer: { email: String(payerEmail || '').trim().toLowerCase().slice(0, 180) },
    payment_methods: {
      excluded_payment_types: [
        { id: 'ticket' },
        { id: 'bank_transfer' }
      ],
      installments: 12
    },
    external_reference: orderId,
    back_urls: {
      success: `${base}/pagamento.html?status=success&pedido=${encodeURIComponent(orderId)}`,
      failure: `${base}/pagamento.html?status=failure&pedido=${encodeURIComponent(orderId)}`,
      pending: `${base}/pagamento.html?status=pending&pedido=${encodeURIComponent(orderId)}`
    },
    auto_return: 'approved',
    notification_url: `${base}/api/mercadopago/webhook`
  };

  const data = await mpRequest('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(body)
  });
  if (!data.id || !data.init_point) throw new Error('O Mercado Pago não retornou a preferência de pagamento completa.');
  return data;
}

async function createPix({ orderId, items, payer, base }) {
  const subtotal = Number(items.reduce((s, i) => s + i.quantidade * i.unit_price, 0).toFixed(2));
  const total = Number((subtotal * 0.95).toFixed(2));
  const nome = String(payer?.nome || 'Cliente').trim().split(/\s+/);
  const firstName = nome.shift() || 'Cliente';
  const lastName = nome.join(' ') || 'Cliente';
  const body = {
    transaction_amount: total,
    description: `Pedido ${orderId}`,
    payment_method_id: 'pix',
    external_reference: orderId,
    notification_url: `${base}/api/mercadopago/webhook`,
    payer: {
      email: String(payer?.email || '').trim().toLowerCase().slice(0, 180),
      first_name: firstName.slice(0, 80),
      last_name: lastName.slice(0, 80)
    }
  };
  const data = await mpRequest('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(body)
  });
  const tx = data.point_of_interaction?.transaction_data || {};
  if (!data.id || !tx.qr_code || !tx.qr_code_base64) throw new Error('O Mercado Pago não retornou o QR Code do PIX.');
  return {
    payment: data,
    subtotal,
    total,
    desconto: Number((subtotal - total).toFixed(2)),
    pix: { qr_code: String(tx.qr_code), qr_code_base64: String(tx.qr_code_base64), ticket_url: tx.ticket_url ? String(tx.ticket_url) : null }
  };
}

function validateWebhook(req) {
  const secret = String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();
  const signature = String(req.get('x-signature') || '').trim();
  const requestId = String(req.get('x-request-id') || '').trim();
  const dataIdRaw = String(req.query['data.id'] || '').trim();
  if (!secret || !signature || !dataIdRaw) return false;

  const parts = Object.fromEntries(signature.split(',').map(part => {
    const idx = part.indexOf('=');
    return idx > 0 ? [part.slice(0, idx).trim(), part.slice(idx + 1).trim()] : ['', ''];
  }).filter(([k, v]) => k && v));
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !/^\d+$/.test(ts) || !/^[a-f0-9]{64}$/i.test(v1)) return false;

  const dataId = dataIdRaw.toLowerCase();
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest, 'utf8').digest('hex');
  return safeEqual(expected, v1.toLowerCase());
}

async function getPayment(paymentId) {
  return mpRequest(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
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
  console.log('Mercado Pago v2 pedido atualizado:', { orderId, status: order.status, payment_status: order.payment_status, payment_id: order.payment_id });
  return order;
}

function registerMercadoPagoV2(app) {
  app.use('/api/checkout', express.json({ limit: '1mb' }));

  app.post('/api/checkout', async (req, res) => {
    try {
      const { items, payer, metodo } = req.body || {};
      if (!payer?.email || !payer?.nome) return res.status(400).json({ error: 'Faça login antes de finalizar a compra.' });
      const normalized = normalizeCartItems(items);
      const base = String(process.env.PUBLIC_URL || '').replace(/\/+$/, '');
      if (!base.startsWith('https://')) return res.status(503).json({ error: 'PUBLIC_URL precisa ser HTTPS.' });
      const orderId = `PED-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      if (metodo === 'pix') {
        const result = await createPix({ orderId, items: normalized, payer, base });
        const order = {
          id: orderId,
          status: statusPedido(result.payment.status),
          payment_status: String(result.payment.status || 'pending'),
          payment_id: String(result.payment.id),
          payer: { nome: String(payer.nome).slice(0, 120), email: String(payer.email).slice(0, 180) },
          items: normalized.map(i => ({ ...i, unit_price: Number((i.unit_price * 0.95).toFixed(2)) })),
          subtotal: result.subtotal,
          total: result.total,
          desconto_pix: result.desconto,
          metodo: 'pix',
          pix: result.pix,
          payment_detail: paymentSafe(result.payment),
          created_at: new Date().toISOString()
        };
        const orders = read(ORDERS, []); orders.push(order); write(ORDERS, orders);
        console.log('Mercado Pago v2 PIX criado:', { orderId, payment_id: order.payment_id, total: order.total });
        return res.json({ order_id: orderId, payment_id: order.payment_id, redirect_url: `${base}/pagamento-pix.html?pedido=${encodeURIComponent(orderId)}` });
      }

      const preference = await createCheckoutPro({ orderId, items: normalized, payerEmail: payer.email, base });
      const total = Number(normalized.reduce((s, i) => s + i.quantidade * i.unit_price, 0).toFixed(2));
      const order = {
        id: orderId,
        status: 'pending',
        payment_status: 'pending',
        payer: { nome: String(payer.nome).slice(0, 120), email: String(payer.email).slice(0, 180) },
        items: normalized,
        subtotal: total,
        total,
        desconto_pix: 0,
        metodo: 'cartao',
        preference_id: String(preference.id),
        created_at: new Date().toISOString()
      };
      const orders = read(ORDERS, []); orders.push(order); write(ORDERS, orders);
      console.log('Mercado Pago v2 preferência criada:', { orderId, preference_id: preference.id, total, item_count: normalized.length, payer_fields: ['email'], excluded_payment_types: ['ticket', 'bank_transfer'] });
      return res.json({ order_id: orderId, init_point: preference.init_point });
    } catch (error) {
      console.error('Erro Mercado Pago v2 /api/checkout:', { message: error.message, status: error.status || null, data: error.data || null });
      return res.status(error.status && error.status < 500 ? error.status : 502).json({ error: error.message || 'Não foi possível iniciar o pagamento.' });
    }
  });

  app.post('/api/mercadopago/webhook', async (req, res) => {
    const type = String(req.body?.type || req.body?.topic || '');
    const paymentId = String(req.body?.data?.id || req.query['data.id'] || '');
    if (!validateWebhook(req)) {
      console.warn('Mercado Pago v2: webhook ignorado por assinatura inválida ou formato sem data.id.', { type, paymentId: paymentId || null });
      return res.sendStatus(401);
    }
    if (type !== 'payment' || !paymentId) return res.sendStatus(200);
    try {
      const payment = await getPayment(paymentId);
      applyPayment(payment);
      return res.sendStatus(200);
    } catch (error) {
      console.error('Mercado Pago v2 webhook:', { message: error.message, status: error.status || null, paymentId });
      return res.sendStatus(500);
    }
  });
}

module.exports = { registerMercadoPagoV2 };
