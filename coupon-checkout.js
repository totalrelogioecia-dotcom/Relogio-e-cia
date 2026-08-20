const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const { resolveSelectedShipping, isConfigured } = require('./shipping-service');
const { validateCoupon, consumeCoupon } = require('./coupon-service');
const { flushPersistentStore } = require('./persistent-store');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const PRODUCTS = path.join(DATA, 'products.json');
const ORDERS = path.join(DATA, 'orders.json');
const ORDERS_API = 'https://api.mercadopago.com/v1/orders';

function read(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function write(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); }
function digits(value) { return String(value || '').replace(/\D/g, ''); }
function money(value) { return Number(Number(value || 0).toFixed(2)); }
function amountString(value) { return money(value).toFixed(2); }

function accessToken() {
  const value = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!value) throw Object.assign(new Error('MERCADOPAGO_ACCESS_TOKEN não configurado.'), { status: 503 });
  return value;
}

function sdkPreference() {
  return new Preference(new MercadoPagoConfig({ accessToken: accessToken(), options: { timeout: 10000, maxRetries: 2 } }));
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
    const error = new Error(data?.message || data?.error || `Mercado Pago respondeu HTTP ${response.status}.`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw Object.assign(new Error('Carrinho vazio.'), { status: 400 });
  const products = read(PRODUCTS, []);
  return rawItems.map(raw => {
    const product = products.find(p => Number(p.id) === Number(raw.id) && p.ativo !== false);
    const quantidade = Math.max(1, Math.min(99, Number(raw.qtd) || 1));
    if (!product) throw Object.assign(new Error('Um produto do carrinho não foi encontrado.'), { status: 400 });
    if (Number(product.estoque) < quantidade) throw Object.assign(new Error(`Estoque insuficiente para ${product.nome}.`), { status: 409 });
    return {
      id: Number(product.id),
      sku: String(product.sku || ''),
      nome: String(product.nome || 'Produto'),
      quantidade,
      unit_price: money(product.preco)
    };
  });
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  return { first: (parts.shift() || 'Cliente').slice(0, 80), last: parts.join(' ').slice(0, 120) };
}

function preferencePayer(payer) {
  const name = splitName(payer?.nome);
  const result = { name: name.first, email: String(payer?.email || '').trim().toLowerCase().slice(0, 180) };
  if (name.last) result.surname = name.last;
  const type = String(payer?.identificacao?.type || '').trim().toUpperCase();
  const number = digits(payer?.identificacao?.number);
  if (type && number) result.identification = { type, number };
  return result;
}

function receiverAddress(payer) {
  const address = payer?.endereco || {};
  const zip = digits(address.zip_code).slice(0, 8);
  const street = String(address.street_name || '').trim().slice(0, 120);
  const number = Number(String(address.street_number || '').match(/\d+/)?.[0] || 0);
  if (zip.length !== 8 || !street || !number) return undefined;
  return { zip_code: zip, street_name: street, street_number: number, city_name: String(address.city_name || '').slice(0, 120), state_name: String(address.state_code || address.state_name || '').slice(0, 120), country_name: 'Brasil' };
}

function statementDescriptor() {
  return String(process.env.MERCADOPAGO_STATEMENT_DESCRIPTOR || 'RELOGIOECIA')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 13) || 'RELOGIOECIA';
}

function publicBaseUrl() {
  const base = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (!base.startsWith('https://')) throw Object.assign(new Error('PUBLIC_URL precisa estar configurada com HTTPS.'), { status: 503 });
  return base;
}

async function persistOrder(order) {
  const orders = read(ORDERS, []);
  const index = orders.findIndex(item => item.id === order.id);
  if (index >= 0) orders[index] = order; else orders.push(order);
  write(ORDERS, orders);
  await flushPersistentStore();
}

async function resolveShipping(body, payer) {
  if (!isConfigured()) return null;
  const selected = body?.shipping;
  if (!selected?.service_id || !selected?.postal_code) throw Object.assign(new Error('Calcule e selecione uma opção de frete antes de finalizar o pedido.'), { status: 409 });
  const accountZip = digits(payer?.endereco?.zip_code).slice(0, 8);
  const selectedZip = digits(selected.postal_code).slice(0, 8);
  if (accountZip && accountZip !== selectedZip) throw Object.assign(new Error('O CEP do frete deve ser o mesmo do endereço de entrega cadastrado na sua conta.'), { status: 409 });
  return resolveSelectedShipping({ postalCode: selectedZip, serviceId: selected.service_id, items: body.items });
}

function registerCouponCheckout(app) {
  app.use('/api/checkout', express.json({ limit: '1mb' }));

  app.post('/api/checkout', async (req, res, next) => {
    const couponCode = String(req.body?.coupon || '').trim();
    if (!couponCode) return next();

    let orderId = null;
    try {
      const body = req.body || {};
      const payer = body.payer || {};
      if (!payer.email || !payer.nome) return res.status(401).json({ error: 'Faça login antes de finalizar a compra.' });

      const items = normalizeItems(body.items);
      const subtotal = money(items.reduce((sum, item) => sum + item.quantidade * item.unit_price, 0));
      const shipping = await resolveShipping(body, payer);
      const originalShipping = money(shipping?.price || 0);
      const validation = await validateCoupon({ code: couponCode, subtotal, shippingCost: originalShipping, email: payer.email });
      if (!validation.valid) return res.status(400).json({ error: validation.error || 'Cupom inválido.' });

      orderId = `PED-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const freeShipping = {
        ...shipping,
        original_price: originalShipping,
        price: 0,
        coupon_code: validation.coupon.code
      };
      const base = publicBaseUrl();
      const method = body.metodo === 'pix' ? 'pix' : 'cartao';
      const pixDiscount = method === 'pix' ? money(subtotal * 0.05) : 0;
      const total = money(subtotal - pixDiscount);

      const localOrder = {
        id: orderId,
        status: 'creating',
        payment_status: 'creating',
        payment_id: null,
        mp_order_id: null,
        payer: { nome: String(payer.nome).slice(0, 120), email: String(payer.email).slice(0, 180), endereco: payer.endereco || null },
        items,
        subtotal,
        desconto_pix: pixDiscount,
        shipping: freeShipping,
        coupon: { id: validation.coupon.id, code: validation.coupon.code, type: 'free_shipping', discount: originalShipping },
        metodo: method,
        total,
        created_at: new Date().toISOString()
      };
      await persistOrder(localOrder);

      if (method === 'pix') {
        const mpOrder = await mpRequest(ORDERS_API, {
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
        const payment = mpOrder?.transactions?.payments?.[0] || {};
        localOrder.mp_order_id = String(mpOrder.id || '');
        localOrder.payment_id = payment?.id ? String(payment.id) : null;
        localOrder.payment_status = String(payment?.status || mpOrder?.status || 'pending');
        localOrder.status = ['processed', 'approved'].includes(String(mpOrder?.status || payment?.status || '').toLowerCase()) ? 'paid' : 'pending';
        localOrder.pix = {
          qr_code: payment?.payment_method?.qr_code || null,
          qr_code_base64: payment?.payment_method?.qr_code_base64 || null,
          ticket_url: payment?.payment_method?.ticket_url || null
        };
        localOrder.updated_at = new Date().toISOString();
        await persistOrder(localOrder);
        await consumeCoupon(validation.coupon.id, payer.email, orderId);
        const redirectUrl = `${base}/pagamento-pix.html?pedido=${encodeURIComponent(orderId)}`;
        return res.json({ order_id: orderId, payment_id: localOrder.payment_id, mp_order_id: localOrder.mp_order_id, redirect_url: redirectUrl, init_point: redirectUrl, coupon: localOrder.coupon });
      }

      const preference = sdkPreference();
      const pref = await preference.create({
        body: {
          items: items.map(item => ({ id: String(item.sku || item.id), title: item.nome.slice(0, 256), quantity: item.quantidade, currency_id: 'BRL', unit_price: item.unit_price })),
          payer: preferencePayer(payer),
          payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'bank_transfer' }], installments: 12 },
          shipments: { cost: 0, mode: 'not_specified', ...(receiverAddress(payer) ? { receiver_address: receiverAddress(payer) } : {}) },
          statement_descriptor: statementDescriptor(),
          external_reference: orderId,
          back_urls: {
            success: `${base}/pagamento.html?status=success&pedido=${encodeURIComponent(orderId)}`,
            failure: `${base}/pagamento.html?status=failure&pedido=${encodeURIComponent(orderId)}`,
            pending: `${base}/pagamento.html?status=pending&pedido=${encodeURIComponent(orderId)}`
          },
          auto_return: 'approved'
        },
        requestOptions: { idempotencyKey: crypto.randomUUID() }
      });
      if (!pref?.id) throw new Error('O Mercado Pago não retornou o ID da preferência.');
      localOrder.status = 'pending';
      localOrder.payment_status = 'pending';
      localOrder.preference_id = String(pref.id);
      localOrder.updated_at = new Date().toISOString();
      await persistOrder(localOrder);
      await consumeCoupon(validation.coupon.id, payer.email, orderId);
      return res.json({ order_id: orderId, preference_id: localOrder.preference_id, coupon: localOrder.coupon });
    } catch (error) {
      console.error('Checkout com cupom de frete grátis falhou:', { orderId, message: error.message, status: error.status || 500 });
      return res.status(error.status >= 400 && error.status < 500 ? error.status : 502).json({ error: error.message || 'Não foi possível aplicar o cupom.' });
    }
  });
}

module.exports = { registerCouponCheckout };
