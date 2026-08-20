const crypto = require('crypto');
const express = require('express');
const { listCoupons, saveCoupon, deleteCoupon, validateCoupon } = require('./coupon-service');

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

function registerCouponRoutes(app) {
  app.use('/api/coupons', express.json({ limit: '256kb' }));
  app.use('/api/admin/coupons', express.json({ limit: '256kb' }));

  app.post('/api/coupons/validate', async (req, res) => {
    try {
      const result = await validateCoupon({
        code: req.body?.code,
        subtotal: req.body?.subtotal,
        shippingCost: req.body?.shipping_cost,
        email: req.body?.email
      });
      if (!result.valid) return res.status(400).json(result);
      res.set('Cache-Control', 'no-store');
      return res.json(result);
    } catch (error) {
      console.error('Erro ao validar cupom:', error.message);
      return res.status(error.status || 500).json({ valid: false, error: error.message || 'Não foi possível validar o cupom.' });
    }
  });

  app.get('/api/admin/coupons', admin, async (req, res) => {
    try { res.json(await listCoupons()); }
    catch (error) { res.status(error.status || 500).json({ error: error.message }); }
  });

  app.post('/api/admin/coupons', admin, async (req, res) => {
    try { res.status(201).json(await saveCoupon(req.body || {})); }
    catch (error) { res.status(error.status || 500).json({ error: error.message }); }
  });

  app.put('/api/admin/coupons/:id', admin, async (req, res) => {
    try { res.json(await saveCoupon(req.body || {}, req.params.id)); }
    catch (error) { res.status(error.status || 500).json({ error: error.message }); }
  });

  app.delete('/api/admin/coupons/:id', admin, async (req, res) => {
    try { await deleteCoupon(req.params.id); res.json({ ok: true }); }
    catch (error) { res.status(error.status || 500).json({ error: error.message }); }
  });
}

module.exports = { registerCouponRoutes };
