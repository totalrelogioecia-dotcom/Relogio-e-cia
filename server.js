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
