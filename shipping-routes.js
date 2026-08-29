const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const {
  configStatus,
  quoteShipping,
  SHIPPING_PRODUCTS
} = require('./shipping-service');
const { normalizeBoxSize } = require('./shipping-packaging');

const quoteAttempts = new Map();

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
  } catch { return false; }
}

function admin(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!validAdminToken(token)) return res.status(401).json({ error: 'Sessão administrativa inválida ou expirada.' });
  next();
}

function quoteRateLimit(req, res, next) {
  const now = Date.now();
  const windowMs = 60_000;
  const max = 20;
  const key = String(req.ip || req.socket?.remoteAddress || 'unknown');
  const current = (quoteAttempts.get(key) || []).filter(time => now - time < windowMs);
  if (current.length >= max) {
    quoteAttempts.set(key, current);
    res.set('Retry-After', '60');
    return res.status(429).json({ error: 'Muitas cotações em pouco tempo. Aguarde um minuto e tente novamente.' });
  }
  current.push(now);
  quoteAttempts.set(key, current);
  if (quoteAttempts.size > 1000) {
    for (const [ip, times] of quoteAttempts.entries()) {
      const fresh = times.filter(time => now - time < windowMs);
      if (fresh.length) quoteAttempts.set(ip, fresh);
      else quoteAttempts.delete(ip);
    }
  }
  next();
}

function normalizeShippingInput(body) {
  const cleanNumber = (value, max) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n > max) return null;
    return Number(n.toFixed(3));
  };

  // O peso pode ficar pendente enquanto a loja ainda valida caixa + proteção reais.
  const weight = cleanNumber(body?.weight_kg, 1000);
  const width = cleanNumber(body?.width_cm, 1000);
  const height = cleanNumber(body?.height_cm, 1000);
  const length = cleanNumber(body?.length_cm, 1000);
  const boxSize = normalizeBoxSize(body?.box_size);

  if (![width, height, length].every(Boolean) && !boxSize) {
    const error = new Error('Informe largura, altura e comprimento ou escolha uma caixa P, M ou G.');
    error.status = 400;
    throw error;
  }

  return {
    weight_kg: weight,
    width_cm: width,
    height_cm: height,
    length_cm: length,
    box_size: boxSize,
    updated_at: new Date().toISOString()
  };
}

function registerShippingRoutes(app) {
  app.use('/api/shipping', express.json({ limit: '512kb' }));
  app.use('/api/admin/shipping-products', express.json({ limit: '512kb' }));

  app.get('/api/shipping/config', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(configStatus());
  });

  app.post('/api/shipping/quote', quoteRateLimit, async (req, res) => {
    try {
      const result = await quoteShipping({
        postalCode: req.body?.postal_code,
        items: req.body?.items
      });
      res.set('Cache-Control', 'no-store');
      res.json(result);
    } catch (error) {
      if (Number(error.status) >= 500) {
        console.error('Erro ao calcular frete:', { message: error.message, code: error.code, data: error.data || null });
      }
      res.status(Number(error.status) || 500).json({
        error: error.message || 'Não foi possível calcular o frete.',
        code: error.code || null,
        details: Array.isArray(error.provider_errors) ? error.provider_errors : undefined
      });
    }
  });

  app.get('/api/admin/shipping-products', admin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(read(SHIPPING_PRODUCTS, {}));
  });

  app.put('/api/admin/shipping-products/:id', admin, (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Produto inválido.' });
      const map = read(SHIPPING_PRODUCTS, {});
      map[id] = normalizeShippingInput(req.body || {});
      write(SHIPPING_PRODUCTS, map);
      res.json(map[id]);
    } catch (error) {
      res.status(Number(error.status) || 500).json({ error: error.message || 'Não foi possível salvar os dados de frete.' });
    }
  });
}

module.exports = { registerShippingRoutes };
