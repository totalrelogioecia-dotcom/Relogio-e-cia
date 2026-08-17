require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const PRODUCTS = path.join(DATA, 'products.json');
const ORDERS = path.join(DATA, 'orders.json');

fs.mkdirSync(DATA, { recursive: true });

const read = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
};
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
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
  const secret = String(process.env.ADMIN_SESSION_SECRET || '').trim();
  if (!secret) throw new Error('ADMIN_SESSION_SECRET não configurado.');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function validToken(value) {
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

function isPaidOrder(order) {
  return String(order?.status || '').toLowerCase() === 'paid' || String(order?.payment_status || '').toLowerCase() === 'approved';
}

function normalizeInvoiceInput(body, previous = null) {
  const allowed = new Set(['pending', 'emitted', 'cancelled']);
  const status = String(body?.status || previous?.status || 'pending').trim().toLowerCase();
  if (!allowed.has(status)) throw Object.assign(new Error('Status da nota fiscal inválido.'), { statusCode: 400 });

  const number = String(body?.number ?? previous?.number ?? '').trim().slice(0, 40);
  const accessKey = String(body?.access_key ?? previous?.access_key ?? '').replace(/\D/g, '').slice(0, 44);

  if (status === 'emitted') {
    if (!number) throw Object.assign(new Error('Informe o número da NF-e.'), { statusCode: 400 });
    if (accessKey.length !== 44) throw Object.assign(new Error('A chave de acesso da NF-e deve ter 44 dígitos.'), { statusCode: 400 });
  }

  if (status === 'cancelled' && !number && !accessKey) {
    throw Object.assign(new Error('Registre a NF-e antes de marcá-la como cancelada.'), { statusCode: 400 });
  }

  const now = new Date().toISOString();
  return {
    status,
    number: status === 'pending' ? '' : number,
    access_key: status === 'pending' ? '' : accessKey,
    issued_at: status === 'emitted' ? (previous?.issued_at || now) : (previous?.issued_at || null),
    cancelled_at: status === 'cancelled' ? now : null,
    updated_at: now
  };
}

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('/api/products', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(getProducts().filter(p => p.ativo !== false));
});

app.post('/api/admin/login', (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const senha = String(req.body?.senha || '');
    const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const adminPass = String(process.env.ADMIN_PASSWORD || '');
    const secret = String(process.env.ADMIN_SESSION_SECRET || '').trim();

    if (!adminEmail || !adminPass || !secret) return res.status(503).json({ error: 'Painel administrativo não configurado.' });
    if (!safeEqual(email, adminEmail) || !safeEqual(senha, adminPass)) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });

    res.json({
      token: makeToken({ role: 'admin', email: adminEmail, exp: Date.now() + 8 * 60 * 60 * 1000 }),
      admin: { email: adminEmail }
    });
  } catch (error) {
    console.error('Erro no login administrativo:', error);
    res.status(500).json({ error: 'Não foi possível entrar no painel.' });
  }
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

app.patch('/api/admin/orders/:id/invoice', admin, (req, res) => {
  try {
    const orderId = String(req.params.id || '').trim();
    const orders = getOrders();
    const index = orders.findIndex(order => String(order.id) === orderId);
    if (index < 0) return res.status(404).json({ error: 'Pedido não encontrado.' });

    const order = orders[index];
    const requestedStatus = String(req.body?.status || order.invoice?.status || 'pending').trim().toLowerCase();
    if (requestedStatus === 'emitted' && !isPaidOrder(order)) {
      return res.status(409).json({ error: 'A NF-e só pode ser registrada como emitida após a confirmação do pagamento.' });
    }

    order.invoice = normalizeInvoiceInput(req.body, order.invoice || null);
    order.updated_at = new Date().toISOString();
    orders[index] = order;
    write(ORDERS, orders);

    console.log('Nota fiscal atualizada:', {
      orderId,
      invoice_status: order.invoice.status,
      invoice_number: order.invoice.number || null
    });

    res.json(order);
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    if (status >= 500) console.error('Erro ao atualizar nota fiscal:', error);
    res.status(status).json({ error: error.message || 'Não foi possível atualizar a nota fiscal.' });
  }
});

app.get('/api/admin/payment-config', admin, (req, res) => {
  res.json({
    access_token_configured: Boolean(String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim()),
    public_key_configured: Boolean(String(process.env.MERCADOPAGO_PUBLIC_KEY || '').trim()),
    webhook_secret_configured: Boolean(String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim()),
    public_url: String(process.env.PUBLIC_URL || '').replace(/\/+$/, '') || null,
    integration: 'mercadopago-v2'
  });
});

app.listen(PORT, () => {
  console.log(`Relógio e Cia: http://localhost:${PORT}`);
  console.log('Servidor principal iniciado sem rotas legadas do Mercado Pago.');
});
