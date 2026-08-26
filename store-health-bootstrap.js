require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const { collectStoreHealth } = require('./store-health');

const COOKIE_NAME = 'reloja_admin_session';

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseCookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try { result[key] = decodeURIComponent(value); }
    catch { result[key] = value; }
  }
  return result;
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
    return payload.role === 'admin' && Number(payload.exp) > Date.now();
  } catch {
    return false;
  }
}

const originalExpress = express;
if (!originalExpress.__relogioStoreHealthPatched) {
  const wrappedExpress = function (...args) {
    const app = originalExpress(...args);

    app.get('/api/admin/store-health', (req, res) => {
      res.set('Cache-Control', 'no-store');
      const token = parseCookies(req)[COOKIE_NAME];
      if (!validAdminToken(token)) {
        return res.status(401).json({ error: 'Sessão administrativa inválida ou expirada.' });
      }

      try {
        return res.json(collectStoreHealth());
      } catch (error) {
        console.error('Falha ao gerar status da loja:', error.message);
        return res.status(500).json({ error: 'Não foi possível gerar o diagnóstico da loja.' });
      }
    });

    return app;
  };

  Object.assign(wrappedExpress, originalExpress);
  wrappedExpress.__relogioStoreHealthPatched = true;
  require.cache[require.resolve('express')].exports = wrappedExpress;
}
