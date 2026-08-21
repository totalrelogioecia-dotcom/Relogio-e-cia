const fs = require('fs');
const path = require('path');
const express = require('express');
const { userFromRequest, cleanUser } = require('./auth');
const { flushPersistentStore } = require('./persistent-store');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const USERS = path.join(DATA, 'users.json');

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
}

module.exports = { registerCheckoutProfileRoutes, validCpf };
