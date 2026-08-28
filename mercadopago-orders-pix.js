const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { WebhookSignatureValidator } = require('mercadopago');
const { resolveSelectedShipping, isConfigured } = require('./shipping-service');
const { flushPersistentStore } = require('./persistent-store');
const { assertPickupAllowed } = require('./pickup-policy');
const {
  readDetails,
  validateCheckoutAvailability,
  shouldApplyPhysicalStock
} = require('./product-availability-service');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const PRODUCTS = path.join(DATA, 'products.json');
const ORDERS = path.join(DATA, 'orders.json');
const API = 'https://api.mercadopago.com/v1/orders';

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function write(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); }
async function persist(orders) { write(ORDERS, orders); await flushPersistentStore(); }
function digits(value) { return String(value || '').replace(/\D/g, ''); }
function money(value) { return Number(Number(value || 0).toFixed(2)); }
function amountString(value) { return money(value).toFixed(2); }

function accessToken() {
  const token = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!token) { const error = new Error('MERCADOPAGO_ACCESS_TOKEN não configurado.'); error.status = 503; throw error; }
  return token;
}

function apiErrorDetails(data) {
  const errors = Array.isArray(data?.errors) ? data.errors : [];
  return errors.map((item, index) => {
    if (!item || typeof item !== 'object') return `#${index + 1}: ${String(item)}`;
    const parts = [
      item.code ? `code=${item.code}` : '',
      item.message ? `message=${item.message}` : '',
      item.detail ? `detail=${item.detail}` : '',
      item.description ? `description=${item.description}` : '',
      item.field ? `field=${item.field}` : ''
    ].filter(Boolean);
    return `#${index + 1}: ${parts.join(', ') || JSON.stringify(item)}`;
  }).join(' | ');
}

async function mpRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken()}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = apiErrorDetails(data);
    const message = data?.message || data?.error || data?.cause?.[0]?.description || details || `Mercado Pago respondeu HTTP ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    error.details = details;
    throw error;
  }
  return data;
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) { const e = new Error('Carrinho vazio.'); e.status = 400; throw e; }
  const products = read(PRODUCTS, []);
  const detailsMap = readDetails();
  return rawItems.map(raw => {
    const product = products.find(item => Number(item.id) === Number(raw.id) && item.ativo !== false);
    if (!product) { const e = new Error('Um produto do carrinho não foi encontrado.'); e.status = 400; throw e; }
    const quantidade = Math.max(1, Math.min(99, Number(raw.qtd) || 1));
    const availability = validateCheckoutAvailability(product, quantidade, detailsMap);
    return {
      id: Number(product.id),
      sku: String(product.sku || ''),
      nome: String(product.nome || 'Produto'),
      quantidade,
      unit_price: money(product.preco),
      disponibilidade: availability.type,
      prazo_preparacao_dias_uteis: availability.preparation_days || 0
    };
  });
}

async function shippingFor(body, payer) {
  const selected = body?.shipping;
  const serviceId = String(selected?.service_id || selected?.mode || '').trim().toLowerCase();

  if (serviceId === 'pickup') {
    assertPickupAllowed(payer);
    return resolveSelectedShipping({
      postalCode: digits(selected?.postal_code).slice(0, 8),
      serviceId: 'pickup',
      items: body.items
    });
  }

  if (!isConfigured()) {
    const e = new Error('A entrega ainda não está disponível. Se o endereço for em Porto Alegre/RS, selecione Retirar na loja.');
    e.status = 409;
    throw e;
  }

  if (!selected?.service_id || !selected?.postal_code) { const e = new Error('Calcule e selecione uma opção de frete antes de finalizar o pedido.'); e.status = 409; throw e; }
  const accountZip = digits(payer?.endereco?.zip_code).slice(0, 8);
  const selectedZip = digits(selected.postal_code).slice(0, 8);
  if (accountZip && accountZip !== selectedZip) { const e = new Error('O CEP do frete deve ser o mesmo do endereço de entrega cadastrado na sua conta.'); e.status = 409; throw e; }
  return resolveSelectedShipping({ postalCode: selectedZip, serviceId: selected.service_id, items: body.items });
}

function transaction(order) {
  return order?.transactions?.payments?.[0] || null;
}
function localStatus(mpOrder) {
  const status = String(mpOrder?.status || transaction(mpOrder)?.status || '').toLowerCase();
  if (['processed', 'approved'].includes(status)) return 'paid';
  if (['failed', 'rejected'].includes(status)) return 'rejected';
  if (['canceled', 'cancelled'].includes(status)) return 'cancelled';
  if (status === 'refunded') return 'refunded';
  return 'pending';
}

async function applyOrder(mpOrder) {
  const externalReference = String(mpOrder?.external_reference || '').trim();
  if (!externalReference) return null;
  const orders = read(ORDERS, []);
  const index = orders.findIndex(order => order.id === externalReference);
  if (index < 0) return null;
  const order = orders[index];
  const payment = transaction(mpOrder);
  order.mp_order_id = String(mpOrder.id || order.mp_order_id || '');
  order.payment_id = payment?.id ? String(payment.id) : order.payment_id || null;
  order.payment_status = String(payment?.status || mpOrder?.status || 'pending');
  order.status = localStatus(mpOrder);
  order.payment_detail = {
    id: order.payment_id,
    status: order.payment_status,
    status_detail: String(payment?.status_detail || mpOrder?.status_detail || ''),
    payment_method_id: String(payment?.payment_method?.id || 'pix'),
    payment_type_id: String(payment?.payment_method?.type || 'bank_transfer'),
    external_reference: externalReference,
    live_mode: typeof mpOrder?.live_mode === 'boolean' ? mpOrder.live_mode : null
  };
  order.pix = {
    qr_code: payment?.payment_method?.qr_code || order.pix?.qr_code || null,
    qr_code_base64: payment?.payment_method?.qr_code_base64 || order.pix?.qr_code_base64 || null,
    ticket_url: payment?.payment_method?.ticket_url || order.pix?.ticket_url || null
  };
  order.updated_at = new Date().toISOString();

  if (order.status === 'paid' && !order.stock_applied) {
    const products = read(PRODUCTS, []);
    for (const item of order.items || []) {
      if (!shouldApplyPhysicalStock(item)) continue;
      const p = products.find(product => Number(product.id) === Number(item.id));
      if (p) p.estoque = Math.max(0, Number(p.estoque || 0) - Number(item.quantidade || 0));
    }
    write(PRODUCTS, products);
    order.stock_applied = true;
  }
  orders[index] = order;
  await persist(orders);
  return order;
}

async function fetchOrder(id) { return mpRequest(`${API}/${encodeURIComponent(id)}`); }

function registerMercadoPagoOrdersPix(app) {
  app.post('/api/checkout', express.json({ limit: '1mb' }), async (req, res, next) => {
    if (req.body?.metodo !== 'pix') return next();
    let orderId = null;
    try {
      const body = req.body || {};
      const payer = body.payer || {};
      if (!payer.email || !payer.nome) return res.status(401).json({ error: 'Faça login antes de finalizar a compra.' });
      const items = normalizeItems(body.items);
      const shipping = await shippingFor(body, payer);
      const subtotal = money(items.reduce((sum, item) => sum + item.quantidade * item.unit_price, 0));
      const discount = money(subtotal * 0.05);
      const shippingCost = money(shipping?.price || 0);
      const total = money(subtotal - discount + shippingCost);
      orderId = `PED-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      const localOrder = {
        id: orderId,
        status: 'creating', payment_status: 'creating', payment_id: null, mp_order_id: null,
        payer: { nome: String(payer.nome).slice(0, 120), email: String(payer.email).slice(0, 180), endereco: payer.endereco || null },
        items, subtotal, desconto_pix: discount, shipping, metodo: 'pix', total,
        created_at: new Date().toISOString()
      };
      const orders = read(ORDERS, []); orders.push(localOrder); await persist(orders);

      const mpOrder = await mpRequest(API, {
        method: 'POST',
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          type: 'online',
          processing_mode: 'automatic',
          external_reference: orderId,
          total_amount: amountString(total),
          payer: { email: String(payer.email).trim().toLowerCase().slice(0, 180) },
          transactions: { payments: [{ amount: amountString(total), payment_method: { id: 'pix', type: 'bank_transfer' } }] }
        })
      });

      const saved = await applyOrder(mpOrder);
      const pix = saved?.pix || {};
      if (!saved?.mp_order_id || (!pix.qr_code && !pix.ticket_url)) throw new Error('O Mercado Pago não retornou os dados do PIX.');
      const base = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
      const redirectUrl = `${base}/pagamento-pix.html?pedido=${encodeURIComponent(orderId)}`;
      console.log('Mercado Pago Orders: PIX criado', { orderId, mp_order_id: saved.mp_order_id, payment_id: saved.payment_id, total });
      return res.json({ order_id: orderId, payment_id: saved.payment_id, mp_order_id: saved.mp_order_id, redirect_url: redirectUrl, init_point: redirectUrl });
    } catch (error) {
      if (orderId) {
        const orders = read(ORDERS, []); const index = orders.findIndex(o => o.id === orderId);
        if (index >= 0) { orders[index].status = 'checkout_error'; orders[index].payment_status = 'checkout_error'; orders[index].checkout_error = String(error.message).slice(0, 500); orders[index].updated_at = new Date().toISOString(); await persist(orders).catch(() => {}); }
      }
      console.error('Mercado Pago Orders: erro no PIX', {
        orderId,
        message: error.message,
        status: error.status || 502,
        details: error.details || null,
        response: error.data ? JSON.stringify(error.data) : null
      });
      return res.status(error.status >= 400 && error.status < 500 ? error.status : 502).json({ error: error.message || 'Não foi possível criar o PIX.' });
    }
  });

  app.post('/api/mercadopago/webhook', express.json({ limit: '1mb' }), (req, res, next) => {
    const type = String(req.body?.type || req.query?.type || '').trim().toLowerCase();
    if (type !== 'order' && type !== 'orders') return next();

    const orderId = String(req.query?.['data.id'] || req.body?.data?.id || '').trim();
    console.log('Mercado Pago Orders: evento order reconhecido e ignorado', {
      orderId: orderId || null
    });
    return res.sendStatus(200);
  });

  app.get('/api/order/:id', async (req, res, next) => {
    let order = read(ORDERS, []).find(item => item.id === req.params.id);
    if (!order || order.metodo !== 'pix' || !order.mp_order_id) return next();
    if (!['paid', 'rejected', 'cancelled', 'refunded'].includes(order.status)) {
      try { order = await applyOrder(await fetchOrder(order.mp_order_id)) || order; } catch (error) { console.warn('Mercado Pago Orders: sincronização PIX falhou', { orderId: order.id, message: error.message }); }
    }
    res.set('Cache-Control', 'no-store');
    return res.json({ id: order.id, status: order.status, payment_status: order.payment_status, payment_id: order.payment_id || null, mp_order_id: order.mp_order_id || null, metodo: 'pix', pix: order.pix || null, payment_detail: order.payment_detail || null, checkout_error: order.checkout_error || null, updated_at: order.updated_at || null });
  });
}

module.exports = { registerMercadoPagoOrdersPix };
