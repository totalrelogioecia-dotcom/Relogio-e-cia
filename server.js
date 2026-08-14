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
  for (const part of String(header || '').split(',')) {
    const [key, ...rest] = part.trim().split('=');
    if (key) result[key.trim().toLowerCase()] = rest.join('=').trim();
  }
  return result;
}

function validarWebhookMercadoPago(req) {
  const secret = String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();
  const signature = String(req.get('x-signature') || '').trim();
  const requestId = String(req.get('x-request-id') || '').trim();
  let dataId = String(req.query['data.id'] || '').trim();

  if (/^[a-z0-9]+$/i.test(dataId)) dataId = dataId.toLowerCase();

  if (!secret || !signature || !dataId) {
    console.error('Webhook sem credenciais obrigatórias:', {
      hasSecret: Boolean(secret), hasSignature: Boolean(signature), hasQueryDataId: Boolean(dataId)
    });
    return false;
  }

  const { ts, v1 } = parseSignature(signature);
  if (!ts || !v1) {
    console.error('Webhook com x-signature em formato inválido.');
    return false;
  }

  const manifestParts = [`id:${dataId}`];
  if (requestId) manifestParts.push(`request-id:${requestId}`);
  manifestParts.push(`ts:${ts}`);
  const manifest = `${manifestParts.join(';')};`;

  const expected = crypto.createHmac('sha256', secret).update(manifest, 'utf8').digest('hex');
  const valid = safeEqual(expected, v1.toLowerCase());

  if (!valid) {
    console.error('Assinatura do webhook inválida.', {
      hasSecret: true,
      hasRequestId: Boolean(requestId),
      dataIdLength: dataId.length,
      ts,
      manifest
    });
    return false;
  }

  return true;
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

  res.sendStatus(200);

  if (type !== 'payment' || !paymentId) return;

  try {
    const access = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!access) return console.error('MERCADOPAGO_ACCESS_TOKEN não configurado.');

    const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${access}` }
    });
    if (!response.ok) return console.error('Erro ao consultar pagamento:', response.status);

    const payment = await response.json();
    const orderId = payment.external_reference;
    if (!orderId) return console.error('Pagamento sem external_reference.');

    const orders = getOrders();
    const index = orders.findIndex(order => order.id === orderId);
    if (index < 0) return console.error('Pedido não encontrado:', orderId);

    orders[index].payment_id = String(payment.id);
    orders[index].payment_status = payment.status || 'pending';
    orders[index].status = payment.status === 'approved'
      ? 'paid'
      : payment.status === 'rejected'
        ? 'rejected'
        : payment.status === 'cancelled'
          ? 'cancelled'
          : 'pending';

    if (payment.status === 'approved' && !orders[index].stock_applied) {
      const products = getProducts();
      for (const item of orders[index].items || []) {
        const productIndex = products.findIndex(product => Number(product.id) === Number(item.id));
        if (productIndex !== -1) {
          products[productIndex].estoque = Math.max(0, Number(products[productIndex].estoque) - Number(item.quantidade));
        }
      }
      write(PRODUCTS, products);
      orders[index].stock_applied = true;
      console.log('Estoque atualizado:', orderId);
    }

    orders[index].updated_at = new Date().toISOString();
    write(ORDERS, orders);
    console.log('Pedido atualizado:', orderId, '=>', orders[index].status);
  } catch (error) {
    console.error('Erro ao processar webhook:', error);
  }
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('/api/order/:id', (req, res) => {
  const order = getOrders().find(item => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
  res.json({ id: order.id, status: order.status, payment_status: order.payment_status, total: order.total, created_at: order.created_at });
});

app.listen(PORT, () => {
  console.log(`Relógio e Cia: http://localhost:${PORT}`);
});
