require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const PRODUCTS = path.join(DATA, 'products.json');
const ORDERS = path.join(DATA, 'orders.json');

fs.mkdirSync(DATA, { recursive: true });

const read = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
};

const write = (file, value) => {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
};

const getProducts = () => read(PRODUCTS, []);
const getOrders = () => read(ORDERS, []);

app.use(express.json({ limit: '10mb' }));
app.use(express.static(ROOT, { index: 'index.html' }));

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function makeToken(payload) {
  const secret = process.env.ADMIN_SESSION_SECRET || 'CHANGE-ME';
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function validToken(value) {
  try {
    const [body, sig] = String(value || '').split('.');
    if (!body || !sig) return false;
    const secret = process.env.ADMIN_SESSION_SECRET || 'CHANGE-ME';
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (!safeEqual(sig, expected)) return false;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.role === 'admin' && payload.exp > Date.now();
  } catch { return false; }
}

function admin(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!validToken(token)) return res.status(401).json({ error: 'Sessão administrativa inválida ou expirada.' });
  next();
}

function normalizeProduct(p) {
  return {
    id: Number(p.id),
    nome: String(p.nome || '').trim(),
    marca: String(p.marca || '').trim(),
    categoria: String(p.categoria || 'Relógios').trim(),
    preco: Number(p.preco) || 0,
    sku: String(p.sku || '').trim(),
    desc: String(p.desc || '').trim(),
    fotos: Array.isArray(p.fotos) ? p.fotos.filter(Boolean).slice(0, 8) : [],
    estoque: Math.max(0, Number(p.estoque) || 0),
    ativo: p.ativo !== false
  };
}

app.get('/api/products', (req, res) => {
  res.json(getProducts().filter(p => p.ativo !== false));
});

app.post('/api/admin/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const senha = String(req.body?.senha || '');
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPass = String(process.env.ADMIN_PASSWORD || '');
  const secret = String(process.env.ADMIN_SESSION_SECRET || '');

  if (!adminEmail || !adminPass || !secret) {
    return res.status(503).json({ error: 'Painel administrativo não configurado.' });
  }
  if (!safeEqual(email, adminEmail) || !safeEqual(senha, adminPass)) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  }

  res.json({
    token: makeToken({ role: 'admin', email: adminEmail, exp: Date.now() + 8 * 60 * 60 * 1000 }),
    admin: { email: adminEmail }
  });
});

app.get('/api/admin/products', admin, (req, res) => res.json(getProducts()));

app.post('/api/admin/products', admin, (req, res) => {
  const products = getProducts();
  const id = products.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0) + 1;
  const product = normalizeProduct({ ...req.body, id });
  products.push(product);
  write(PRODUCTS, products);
  res.status(201).json(product);
});

app.put('/api/admin/products/:id', admin, (req, res) => {
  const id = Number(req.params.id);
  const products = getProducts();
  const index = products.findIndex(p => Number(p.id) === id);
  if (index < 0) return res.status(404).json({ error: 'Produto não encontrado.' });
  products[index] = normalizeProduct({ ...products[index], ...req.body, id });
  write(PRODUCTS, products);
  res.json(products[index]);
});

app.delete('/api/admin/products/:id', admin, (req, res) => {
  const id = Number(req.params.id);
  const products = getProducts();
  const index = products.findIndex(p => Number(p.id) === id);
  if (index < 0) return res.status(404).json({ error: 'Produto não encontrado.' });
  products[index].ativo = false;
  write(PRODUCTS, products);
  res.json({ ok: true });
});

app.get('/api/admin/orders', admin, (req, res) => {
  res.json(getOrders().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

app.post('/api/checkout', async (req, res) => {
  try {
    const { items, payer, metodo } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Carrinho vazio.' });
    if (!payer?.email || !payer?.nome) return res.status(400).json({ error: 'Dados do comprador incompletos.' });

    const products = getProducts();
    const normalized = [];

    for (const item of items) {
      const product = products.find(p => Number(p.id) === Number(item.id) && p.ativo !== false);
      const quantity = Math.max(1, Math.min(99, Number(item.qtd) || 1));
      if (!product) return res.status(400).json({ error: 'Produto não encontrado.' });
      if (Number(product.estoque) < quantity) return res.status(400).json({ error: `Estoque insuficiente para ${product.nome}.` });
      normalized.push({ id: product.id, nome: product.nome, sku: product.sku, quantidade: quantity, unit_price: Number(product.preco) });
    }

    const access = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const base = String(process.env.PUBLIC_URL || '').replace(/\/+$/, '');
    if (!access) return res.status(503).json({ error: 'Pagamento não configurado.' });
    if (!base.startsWith('https://')) return res.status(503).json({ error: 'PUBLIC_URL precisa ser uma URL HTTPS pública.' });

    const forma = metodo === 'pix' ? 'pix' : 'cartao';
    const descontoPix = forma === 'pix' ? 0.05 : 0;
    const priced = normalized.map(item => ({ ...item, unit_price: Number((item.unit_price * (1 - descontoPix)).toFixed(2)) }));
    const total = Number(priced.reduce((sum, item) => sum + item.quantidade * item.unit_price, 0).toFixed(2));
    const orderId = `PED-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const paymentMethods = forma === 'pix'
      ? { excluded_payment_types: [{ id: 'credit_card' }, { id: 'debit_card' }, { id: 'ticket' }] }
      : { excluded_payment_types: [{ id: 'bank_transfer' }, { id: 'ticket' }], installments: 12 };

    const preference = {
      items: priced.map(item => ({ id: String(item.id), title: item.nome, quantity: item.quantidade, currency_id: 'BRL', unit_price: item.unit_price })),
      payer: { name: String(payer.nome).slice(0, 120), email: String(payer.email).slice(0, 180) },
      payment_methods: paymentMethods,
      external_reference: orderId,
      back_urls: {
        success: `${base}/pagamento.html?status=success&pedido=${encodeURIComponent(orderId)}`,
        failure: `${base}/pagamento.html?status=failure&pedido=${encodeURIComponent(orderId)}`,
        pending: `${base}/pagamento.html?status=pending&pedido=${encodeURIComponent(orderId)}`
      },
      auto_return: 'approved',
      notification_url: `${base}/api/mercadopago/webhook`
    };

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(preference)
    });

    const mp = await response.json();
    if (!response.ok) {
      console.error('Mercado Pago checkout:', mp);
      return res.status(502).json({ error: 'O Mercado Pago recusou o checkout.' });
    }

    const subtotal = Number(normalized.reduce((sum, item) => sum + item.quantidade * item.unit_price, 0).toFixed(2));
    const order = {
      id: orderId,
      status: 'pending',
      payment_status: 'pending',
      payer: { nome: String(payer.nome).slice(0, 120), email: String(payer.email).slice(0, 180) },
      items: priced,
      total,
      subtotal,
      desconto_pix: Number((subtotal * descontoPix).toFixed(2)),
      metodo: forma,
      preference_id: mp.id,
      created_at: new Date().toISOString()
    };

    const orders = getOrders();
    orders.push(order);
    write(ORDERS, orders);

    res.json({ order_id: orderId, init_point: mp.init_point });
  } catch (error) {
    console.error('Erro /api/checkout:', error);
    res.status(500).json({ error: 'Erro interno ao preparar o pagamento.' });
  }
});

function parseSignature(header) {
  const result = {};
  const parts = String(header || '').split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const separator = trimmed.indexOf('=');
    if (separator <= 0) return null;

    const key = trimmed.slice(0, separator).trim().toLowerCase();
    const value = trimmed.slice(separator + 1).trim();

    if (!key || !value) return null;
    if (result[key] !== undefined) return null;
    result[key] = value;
  }

  return result;
}

function validarWebhookMercadoPago(req) {
  const secret = String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();
  const signature = String(req.get('x-signature') || '').trim();
  const requestId = String(req.get('x-request-id') || '').trim();
  const rawDataId = String(req.query['data.id'] || '').trim();

  const fail = (reason, details = {}) => {
    console.warn('Diagnóstico HMAC Mercado Pago:', { reason, ...details });
    return false;
  };

  if (!secret) return fail('MERCADOPAGO_WEBHOOK_SECRET ausente');
  if (!signature) return fail('header x-signature ausente');
  if (!rawDataId) return fail('query data.id ausente');

  const parsed = parseSignature(signature);
  if (!parsed) return fail('formato de x-signature inválido');

  const { ts, v1 } = parsed;
  if (!ts || !v1) return fail('x-signature sem ts ou v1', {
    hasTs: Boolean(ts),
    hasV1: Boolean(v1)
  });

  if (!/^\d+$/.test(ts)) return fail('ts não numérico', { tsLength: ts.length });
  if (!/^[a-f0-9]{64}$/i.test(v1)) return fail('v1 não é SHA-256 hexadecimal', { v1Length: v1.length });

  const timestamp = Number(ts);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    return fail('ts inválido ou fora do intervalo seguro');
  }

  // O Mercado Pago envia ts em MILISSEGUNDOS (normalmente 13 dígitos).
  // Aceitamos segundos (10 dígitos) apenas para facilitar diagnóstico/testes.
  const timestampIsMilliseconds = ts.length >= 13;
  const timestampMs = timestampIsMilliseconds ? timestamp : timestamp * 1000;
  const nowMs = Date.now();
  const deltaMs = nowMs - timestampMs;
  const toleranceSeconds = Math.max(
    0,
    Number(process.env.MERCADOPAGO_WEBHOOK_TOLERANCE_SECONDS || 300)
  );
  const toleranceMs = toleranceSeconds * 1000;

  if (toleranceSeconds > 0 && Math.abs(deltaMs) > toleranceMs) {
    return fail('assinatura fora da janela de tolerância', {
      timestampUnit: timestampIsMilliseconds ? 'milliseconds' : 'seconds',
      deltaSeconds: Number((deltaMs / 1000).toFixed(3)),
      toleranceSeconds,
      tsDigits: ts.length
    });
  }

  const dataId = rawDataId.toLowerCase();
  const variants = [
    {
      name: 'oficial',
      dataId,
      includeRequestId: Boolean(requestId)
    },
    {
      name: 'sem-lowercase',
      dataId: rawDataId,
      includeRequestId: Boolean(requestId)
    },
    {
      name: 'sem-request-id',
      dataId,
      includeRequestId: false
    }
  ];

  const results = variants.map(variant => {
    const manifest = [
      `id:${variant.dataId}`,
      ...(variant.includeRequestId ? [`request-id:${requestId}`] : []),
      `ts:${ts}`
    ].join(';') + ';';

    const expected = crypto
      .createHmac('sha256', secret)
      .update(manifest, 'utf8')
      .digest('hex');

    return {
      name: variant.name,
      matches: safeEqual(expected, v1.toLowerCase()),
      manifestLength: manifest.length,
      manifestHash: crypto.createHash('sha256').update(manifest, 'utf8').digest('hex').slice(0, 12),
      expectedPrefix: expected.slice(0, 12)
    };
  });

  const official = results.find(item => item.name === 'oficial');
  const matched = results.filter(item => item.matches).map(item => item.name);

  console.log('Diagnóstico HMAC Mercado Pago:', {
    dataId: rawDataId,
    dataIdNormalized: dataId,
    dataIdChangedByLowercase: rawDataId !== dataId,
    hasRequestId: Boolean(requestId),
    requestIdLength: requestId.length,
    timestampUnit: timestampIsMilliseconds ? 'milliseconds' : 'seconds',
    tsDigits: ts.length,
    deltaSeconds: Number((deltaMs / 1000).toFixed(3)),
    toleranceSeconds,
    officialMatch: official.matches,
    matchedVariants: matched,
    receivedV1Prefix: v1.slice(0, 12),
    variants: results
  });

  if (official.matches) return true;

  return fail('HMAC divergente', {
    dataIdChangedByLowercase: rawDataId !== dataId,
    hasRequestId: Boolean(requestId),
    matchedVariants: matched,
    receivedV1Prefix: v1.slice(0, 12),
    officialExpectedPrefix: official.expectedPrefix
  });
}

async function consultarPagamento(paymentId) {
  const access = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!access) throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado.');

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${access}` }
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!response.ok) {
    const error = new Error(`Mercado Pago respondeu ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function buscarPagamentoPorPedido(orderId) {
  const access = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!access) throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado.');

  const url = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!response.ok) {
    const error = new Error(`Mercado Pago busca pagamento respondeu ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return Array.isArray(data.results) && data.results.length ? data.results[0] : null;
}

function statusDoPagamento(status) {
  if (status === 'approved') return 'paid';
  if (status === 'rejected') return 'rejected';
  if (status === 'cancelled') return 'cancelled';
  return 'pending';
}

async function aplicarPagamentoAoPedido(payment, orderId) {
  const orders = getOrders();
  const index = orders.findIndex(order => order.id === orderId);
  if (index < 0) throw new Error(`Pedido não encontrado: ${orderId}`);

  const order = orders[index];
  const novoStatus = statusDoPagamento(payment.status);
  const pagamentoMudou = String(order.payment_id || '') !== String(payment.id || '') || order.payment_status !== String(payment.status || 'pending');

  order.payment_id = String(payment.id || '');
  order.payment_status = String(payment.status || 'pending');
  order.status = novoStatus;
  order.payment_detail = {
    status_detail: payment.status_detail || null,
    payment_type_id: payment.payment_type_id || null,
    date_approved: payment.date_approved || null,
    date_last_updated: payment.date_last_updated || null
  };
  order.updated_at = new Date().toISOString();

  if (payment.status === 'approved' && !order.stock_applied) {
    const products = getProducts();
    for (const item of order.items || []) {
      const productIndex = products.findIndex(product => Number(product.id) === Number(item.id));
      if (productIndex !== -1) {
        products[productIndex].estoque = Math.max(0, Number(products[productIndex].estoque) - Number(item.quantidade));
      }
    }
    write(PRODUCTS, products);
    order.stock_applied = true;
    console.log('Estoque atualizado:', orderId);
  }

  if (pagamentoMudou || order.status === 'paid') write(ORDERS, orders);
  console.log('Pedido atualizado:', orderId, '=>', order.status, '| pagamento:', order.payment_status);
  return order;
}

async function sincronizarPedido(order) {
  if (!order || order.payment_status === 'approved' || order.status === 'paid') return order;

  try {
    const payment = await buscarPagamentoPorPedido(order.id);
    if (!payment) return order;
    console.log('Pagamento encontrado por external_reference:', order.id, payment.id, payment.status);
    return await aplicarPagamentoAoPedido(payment, order.id);
  } catch (error) {
    console.error('Erro ao sincronizar pedido:', order.id, error.message);
    return order;
  }
}

app.post('/api/mercadopago/webhook', async (req, res) => {
  const type = String(req.body?.type || req.body?.topic || '');
  const action = String(req.body?.action || '');
  const liveMode = req.body?.live_mode === true;
  const paymentId = String(req.body?.data?.id || req.query['data.id'] || req.body?.id || '');
  const hasQueryDataId = Boolean(req.query['data.id']);
  const hasSignature = Boolean(req.get('x-signature'));

  console.log('Webhook Mercado Pago:', { type, action, paymentId, liveMode, hasQueryDataId, hasSignature });

  if (!liveMode && !hasQueryDataId && !hasSignature) {
    console.log('Simulação sem assinatura recebida. Nenhum pedido foi alterado.');
    return res.sendStatus(200);
  }

  if (!validarWebhookMercadoPago(req)) {
    console.error('Assinatura do webhook inválida.');
    return res.sendStatus(401);
  }

  if (type !== 'payment' || !paymentId) return res.sendStatus(200);

  try {
    const payment = await consultarPagamento(paymentId);
    const orderId = String(payment.external_reference || '');
    if (!orderId) {
      console.error('Pagamento sem external_reference:', paymentId);
      return res.sendStatus(200);
    }

    await aplicarPagamentoAoPedido(payment, orderId);
    return res.sendStatus(200);
  } catch (error) {
    console.error('Erro ao processar webhook:', {
      message: error.message,
      status: error.status || null,
      paymentId
    });
    return res.sendStatus(500);
  }
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('/api/order/:id', async (req, res) => {
  let order = getOrders().find(item => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

  if (order.payment_status === 'pending' || order.status === 'pending') {
    order = await sincronizarPedido(order);
  }

  res.set('Cache-Control', 'no-store');
  res.json({
    id: order.id,
    status: order.status,
    payment_status: order.payment_status,
    payment_id: order.payment_id || null,
    updated_at: order.updated_at || null
  });
});

app.listen(PORT, () => {
  console.log(`Relógio e Cia: http://localhost:${PORT}`);
});