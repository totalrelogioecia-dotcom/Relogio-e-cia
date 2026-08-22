const fs = require('fs');
const path = require('path');
const express = require('express');
const crypto = require('crypto');
const { userFromRequest, cleanUser } = require('./auth');
const { flushPersistentStore } = require('./persistent-store');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const USERS = path.join(DATA, 'users.json');
const ORDERS = path.join(DATA, 'orders.json');

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function write(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function validCpf(value) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const check = length => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      sum += Number(cpf[i]) * (length + 1 - i);
    }
    const mod = (sum * 10) % 11;
    return (mod === 10 ? 0 : mod) === Number(cpf[length]);
  };

  return check(9) && check(10);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
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
  } catch {
    return false;
  }
}

function adminOnly(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!validAdminToken(token)) return res.status(401).json({ error: 'Sessão administrativa inválida ou expirada.' });
  next();
}

function cpfFromOrder(order) {
  const stored = digits(order?.payer?.identificacao?.number);
  if (validCpf(stored)) return stored;

  const email = String(order?.payer?.email || '').trim().toLowerCase();
  if (!email) return '';
  const user = read(USERS, []).find(item => String(item.email || '').trim().toLowerCase() === email);
  const accountCpf = digits(user?.identificacao?.number);
  return validCpf(accountCpf) ? accountCpf : '';
}

function registerCheckoutProfileRoutes(app) {
  app.use('/api/auth/checkout-profile', express.json({ limit: '64kb' }));

  app.post('/api/auth/checkout-profile', async (req, res) => {
    try {
      const user = userFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Entre na sua conta para continuar.' });

      const cpf = digits(req.body?.cpf);
      if (!validCpf(cpf)) {
        return res.status(400).json({ error: 'Informe um CPF válido com 11 dígitos.' });
      }

      const users = read(USERS, []);
      const index = users.findIndex(item => item.id === user.id);
      if (index < 0) return res.status(404).json({ error: 'Conta não encontrada.' });

      users[index].identificacao = { type: 'CPF', number: cpf };
      users[index].updated_at = new Date().toISOString();
      write(USERS, users);
      await flushPersistentStore();

      return res.json({ user: cleanUser(users[index]) });
    } catch (error) {
      console.error('Erro ao salvar CPF para checkout:', error.message);
      return res.status(500).json({ error: 'Não foi possível salvar o CPF. Tente novamente.' });
    }
  });

  app.get('/api/admin/orders/:id/customer-document', adminOnly, (req, res) => {
    const orderId = String(req.params.id || '').trim();
    const order = read(ORDERS, []).find(item => String(item.id) === orderId);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

    const cpf = cpfFromOrder(order);
    res.set('Cache-Control', 'no-store');
    if (!cpf) return res.json({ available: false, type: 'CPF', number: null });

    return res.json({ available: true, type: 'CPF', number: cpf });
  });
}

module.exports = { registerCheckoutProfileRoutes, validCpf };

