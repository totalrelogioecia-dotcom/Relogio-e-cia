const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

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

function normalizeCategory(product) {
  if (product?.categoria_id_mp) return String(product.categoria_id_mp).trim().slice(0, 100);
  const categoria = String(product?.categoria || '').toLowerCase();
  if (categoria.includes('relóg') || categoria.includes('relog') || categoria.includes('acess')) return 'fashion';
  return null;
}

function normalizeCartItems(items) {
  if (!Array.isArray(items) || !items.length) throw Object.assign(new Error('Carrinho vazio.'), { status: 400 });
  const products = read(PRODUCTS, []);

  return items.map(raw => {
    const product = products.find(p => Number(p.id) === Number(raw.id) && p.ativo !== false);
    const qtd = Math.max(1, Math.min(99, Number(raw.qtd) || 1));
    if (!product) throw Object.assign(new Error('Produto não encontrado.'), { status: 400 });
    if (Number(product.estoque) < qtd) throw Object.assign(new Error(`Estoque insuficiente para ${product.nome}.`), { status: 400 });

    const foto = Array.isArray(product.fotos) ? product.fotos.find(url => /^https:\/\//i.test(String(url || ''))) : null;

    return {
      id: Number(product.id),
      nome: String(product.nome || 'Produto'),
      sku: String(product.sku || ''),
      descricao: String(product.desc || '').trim(),
      categoria_id: normalizeCategory(product),
      quantidade: qtd,
      unit_price: Number(product.preco),
      foto: foto || null
    };
  });
}

function getStatementDescriptor() {
  const raw = String(process.env.MERCADOPAGO_STATEMENT_DESCRIPTOR || 'RELOGIOECIA')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 13);
  return raw || 'RELOGIOECIA';
}

function sdkClients() {
  const access = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!access) throw Object.assign(new Error('MERCADOPAGO_ACCESS_TOKEN não configurado.'), { status: 503 });
  const client = new MercadoPagoConfig({
    accessToken: access,
    options: { timeout: 10000, maxRetries: 2 }
  });
  return {
    preference: new Preference(client),
    payment: new Payment(client)
  };
}

function sdkError(error, fallback) {
  const wrapped = new Error(error?.message || fallback || 'Erro na comunicação com o Mercado Pago.');
  const possibleStatus = Number(
    error?.status ||
    error?.statusCode ||
    error?.api_response?.status ||
    error?.cause?.status ||
    error?.cause?.statusCode
  );
  if (Number.isFinite(possibleStatus) && possibleStatus > 0) wrapped.status = possibleStatus;
  wrapped.data = error?.cause || error?.data || null;
  return wrapped;
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  const name = parts.shift() || 'Cliente';
  return { name: name.slice(0, 80), surname: parts.join(' ').slice(0, 120) };
}

function buildPreferencePayer(payer) {
  const fullName = splitName(payer?.nome);
  const result = {
    name: fullName.name,
    email: String(payer?.email || '').trim().toLowerCase().slice(0, 180)
  };
  if (fullName.surname) result.surname = fullName.surname;

  const areaCode = String(payer?.telefone?.area_code || '').replace(/\D/g, '').slice(0, 4);
  const phoneNumber = String(payer?.telefone?.number || '').replace(/\D/g, '').slice(0, 15);
  if (areaCode && phoneNumber) result.phone = { area_code: areaCode, number: phoneNumber };

  const idType = String(payer?.identificacao?.type || '').trim().toUpperCase().slice(0, 20);
  const idNumber = String(payer?.identificacao?.number || '').replace(/\D/g, '').slice(0, 30);
  if (idType && idNumber) result.identification = { type: idType, number: idNumber };

  const zipCode = String(payer?.endereco?.zip_code || '').replace(/\D/g, '').slice(0, 12);
  const streetName = String(payer?.endereco?.street_name || '').trim().slice(0, 120);
  const streetNumberText = String(payer?.endereco?.street_number || '').trim();
  const streetNumberMatch = streetNumberText.match(/\d+/);
  if (zipCode && streetName && streetNumberMatch) {
    result.address = {
      zip_code: zipCode,
      street_name: streetName,
      street_number: Number(streetNumberMatch[0])
    };
  }

  if (payer?.date_created) {
    const createdAt = new Date(payer.date_created);
    if (!Number.isNaN(createdAt.getTime())) result.date_created = createdAt.toISOString();
  }

  return result;
}

function buildPaymentPayer(payer) {
  const fullName = splitName(payer?.nome);
  const result = {
    email: String(payer?.email || '').trim().toLowerCase().slice(0, 180),
    first_name: fullName.name
  };
  if (fullName.surname) result.last_name = fullName.surname;

  const areaCode = String(payer?.telefone?.area_code || '').replace(/\D/g, '').slice(0, 4);
  const phoneNumber = String(payer?.telefone?.number || '').replace(/\D/g, '').slice(0, 15);
  if (areaCode && phoneNumber) result.phone = { area_code: areaCode, number: phoneNumber };

  const idType = String(payer?.identificacao?.type || '').trim().toUpperCase().slice(0, 20);
  const idNumber = String(payer?.identificacao?.number || '').replace(/\D/g, '').slice(0, 30);
  if (idType && idNumber) result.identification = { type: idType, number: idNumber };

  const zipCode = String(payer?.endereco?.zip_code || '').replace(/\D/g, '').slice(0, 12);
  const streetName = String(payer?.endereco?.street_name || '').trim().slice(0, 120);
  const streetNumber = String(payer?.endereco?.street_number || '').trim().slice(0, 20);
  if (zipCode && streetName && streetNumber) {
    result.address = {
      zip_code: zipCode,
      street_name: streetName,
      street_number: streetNumber,
      neighborhood: String(payer?.endereco?.neighborhood || '').trim().slice(0, 120) || undefined,
      city: String(payer?.endereco?.city_name || '').trim().slice(0, 120) || undefined,
      federal_unit: String(payer?.endereco?.state_code || '').trim().toUpperCase().slice(0, 2) || undefined
    };
  }

  return result;
}

function buildPreferenceItems(items) {
  return items.map(item => {
    const result = {
      id: String(item.sku || item.id),
      title: item.nome.slice(0, 256),
      quantity: item.quantidade,
      currency_id: 'BRL',
      unit_price: Number(item.unit_price.toFixed(2)),
      type: 'physical'
    };
    if (item.descricao) result.description = item.descricao.slice(0, 256);
    if (item.foto) result.picture_url = item.foto.slice(0, 1000);
    if (item.categoria_id) result.category_id = item.categoria_id;
    return result;
  });
}

function buildPaymentAdditionalItems(items) {
  return items.map(item => {
    const result = {
      id: String(item.sku || item.id),
      title: item.nome.slice(0, 256),
      quantity: item.quantidade,
      unit_price: Number((item.unit_price * 0.95).toFixed(2))
    };
    if (item.descricao) result.description = item.descricao.slice(0, 256);
    if (item.foto) result.picture_url = item.foto.slice(0, 1000);
    if (item.categoria_id) result.category_id = item.categoria_id;
    return result;
  });
}

async function createCheckoutPro({ orderId, items, payer, base }) {
  const body = {
    items: buildPreferenceItems(items),
    payer: buildPreferencePayer(payer),
    payment_methods: {
      excluded_payment_types: [
        { id: 'ticket' },
        { id: 'bank_transfer' }
      ],
      installments: 12
    },
    statement_descriptor: getStatementDescriptor(),
    external_reference: orderId,
    back_urls: {
      success: `${base}/pagamento.html?status=success&pedido=${encodeURIComponent(orderId)}`,
      failure: `${base}/pagamento.html?status=failure&pedido=${encodeURIComponent(orderId)}`,
      pending: `${base}/pagamento.html?status=pending&pedido=${encodeURIComponent(orderId)}`
    },
    auto_return: 'approved',
    notification_url: `${base}/api/mercadopago/webhook`
  };

  try {
    const { preference } = sdkClients();
    const data = await preference.create({
      body,
      requestOptions: { idempotencyKey: crypto.randomUUID() }
    });
    if (!data?.id || !data?.init_point) throw new Error('O Mercado Pago não retornou a preferência de pagamento completa.');
    return data;
  } catch (error) {
    throw sdkError(error, 'O Mercado Pago recusou a criação da preferência.');
  }
}

async function createPix({ orderId, items, payer, base }) {
  const subtotal = Number(items.reduce((s, i) => s + i.quantidade * i.unit_price, 0).toFixed(2));
  const total = Number((subtotal * 0.95).toFixed(2));
  const paymentItems = buildPaymentAdditionalItems(items);

  const body = {
    transaction_amount: total,
    description: `Pedido ${orderId}`,
    statement_descriptor: getStatementDescriptor(),
    payment_method_id: 'pix',
    external_reference: orderId,
    notification_url: `${base}/api/mercadopago/webhook`,
    payer: buildPaymentPayer(payer),
    additional_info: { items: paymentItems }
  };

  let data;
  try {
    const { payment } = sdkClients();
    data = await payment.create({
      body,
      requestOptions: { idempotencyKey: crypto.randomUUID() }
    });
  } catch (error) {
    throw sdkError(error, 'O Mercado Pago recusou a criação do PIX.');
  }

  const tx = data?.point_of_interaction?.transaction_data || {};
  if (!data?.id || !tx.qr_code || !tx.qr_code_base64) throw new Error('O Mercado Pago não retornou o QR Code do PIX.');

  return {
    payment: data,
    subtotal,
    total,
    desconto: Number((subtotal - total).toFixed(2)),
    pix: {
      qr_code: String(tx.qr_code),
      qr_code_base64: String(tx.qr_code_base64),
      ticket_url: tx.ticket_url ? String(tx.ticket_url) : null
    }
  };
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

  const dataId = dataIdRaw.toLowerCase();
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest, 'utf8').digest('hex');
  return safeEqual(expected, v1.toLowerCase());
}

async function getPayment(paymentId) {
  try {
    const { payment } = sdkClients();
    return await payment.get({ id: String(paymentId) });
  } catch (error) {
    throw sdkError(error, 'Não foi possível consultar o pagamento.');
  }
}

async function findPaymentByOrder(orderId) {
  try {
    const { payment } = sdkClients();
    const data = await payment.search({
      options: {
        external_reference: String(orderId),
        sort: 'date_created',
        criteria: 'desc',
        limit: 1
      }
    });
    return Array.isArray(data?.results) && data.results.length ? data.results[0] : null;
  } catch (error) {
    throw sdkError(error, 'Não foi possível localizar o pagamento do pedido.');
  }
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
  console.log('Mercado Pago pedido atualizado:', {
    orderId,
    status: order.status,
    payment_status: order.payment_status,
    payment_id: order.payment_id,
    status_detail: order.payment_detail?.status_detail || null
  });
  return order;
}

async function syncOrder(order) {
  if (!order || order.status === 'paid' || order.payment_status === 'approved') return order;
  try {
    const payment = order.payment_id ? await getPayment(order.payment_id) : await findPaymentByOrder(order.id);
    if (!payment) return order;
    return applyPayment(payment) || order;
  } catch (error) {
    console.warn('Mercado Pago: não foi possível sincronizar pedido.', { orderId: order.id, message: error.message });
    return order;
  }
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
        const orders = read(ORDERS, []);
        orders.push(order);
        write(ORDERS, orders);

        console.log('Mercado Pago PIX criado:', {
          orderId,
          payment_id: order.payment_id,
          total: order.total,
          sdk_backend: true,
          item_descriptions: normalized.filter(i => i.descricao).length
        });
        return res.json({
          order_id: orderId,
          payment_id: order.payment_id,
          redirect_url: `${base}/pagamento-pix.html?pedido=${encodeURIComponent(orderId)}`
        });
      }

      const preference = await createCheckoutPro({ orderId, items: normalized, payer, base });
      const total = Number(normalized.reduce((s, i) => s + i.quantidade * i.unit_price, 0).toFixed(2));
      const preferencePayer = buildPreferencePayer(payer);
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
      const orders = read(ORDERS, []);
      orders.push(order);
      write(ORDERS, orders);

      console.log('Mercado Pago preferência criada:', {
        orderId,
        preference_id: preference.id,
        total,
        item_count: normalized.length,
        payer_fields: Object.keys(preferencePayer),
        item_descriptions: normalized.filter(i => i.descricao).length,
        picture_urls: normalized.filter(i => i.foto).length,
        category_ids: normalized.filter(i => i.categoria_id).length,
        statement_descriptor: getStatementDescriptor(),
        excluded_payment_types: ['ticket', 'bank_transfer'],
        sdk_backend: true,
        init_point: Boolean(preference.init_point)
      });

      return res.json({ order_id: orderId, init_point: preference.init_point });
    } catch (error) {
      console.error('Erro Mercado Pago /api/checkout:', {
        message: error.message,
        status: error.status || null,
        data: error.data || null
      });
      return res.status(error.status && error.status < 500 ? error.status : 502).json({ error: error.message || 'Não foi possível iniciar o pagamento.' });
    }
  });

  app.post('/api/mercadopago/webhook', async (req, res) => {
    const type = String(req.body?.type || req.body?.topic || '');
    const paymentId = String(req.body?.data?.id || req.query['data.id'] || '');

    if (!paymentId || type !== 'payment') {
      console.log('Mercado Pago webhook ignorado: não é notificação de pagamento.', { type: type || null, paymentId: paymentId || null });
      return res.sendStatus(200);
    }

    if (!validateWebhook(req)) {
      console.warn('Mercado Pago webhook recusado: assinatura inválida.', { type, paymentId });
      return res.sendStatus(401);
    }

    try {
      const payment = await getPayment(paymentId);
      applyPayment(payment);
      return res.sendStatus(200);
    } catch (error) {
      console.error('Mercado Pago webhook:', { message: error.message, status: error.status || null, paymentId });
      return res.sendStatus(500);
    }
  });

  app.get('/api/order/:id', async (req, res) => {
    let order = read(ORDERS, []).find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

    if (order.status === 'pending' || order.payment_status === 'pending') order = await syncOrder(order);

    res.set('Cache-Control', 'no-store');
    return res.json({
      id: order.id,
      status: order.status,
      payment_status: order.payment_status,
      payment_id: order.payment_id || null,
      metodo: order.metodo || null,
      pix: order.pix || null,
      payment_detail: order.payment_detail || null,
      updated_at: order.updated_at || null
    });
  });
}

module.exports = { registerMercadoPagoV2 };
