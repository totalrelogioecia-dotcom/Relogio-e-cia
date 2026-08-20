const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Preference, WebhookSignatureValidator } = require('mercadopago');
const { registerAuthRoutes, userFromRequest } = require('./auth');
const { storageStatus } = require('./persistent-store');
const { registerShippingRoutes } = require('./shipping-routes');
const { registerMelhorEnvioOAuthRoutes } = require('./melhorenvio-oauth-routes');
const { registerProductDetailsRoutes } = require('./product-details-routes');
const { registerCasioEnrichmentV2 } = require('./casio-enrichment-v2');
const { registerImageProxy } = require('./image-proxy');
const { registerOrientEnrichment } = require('./orient-enrichment');
const { registerCouponRoutes } = require('./coupon-routes');
const { registerCouponCheckout } = require('./coupon-checkout');
const { registerMercadoPagoOrdersPix } = require('./mercadopago-orders-pix');
const { registerMercadoPagoClean } = require('./mercadopago-clean');

function parseMercadoPagoSignature(value) {
  const result = {};
  for (const part of String(value || '').split(',')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim().toLowerCase();
    const content = part.slice(index + 1).trim();
    if (key && content) result[key] = content;
  }
  return result;
}

function safeHexEqual(a, b) {
  if (!/^[a-f0-9]+$/i.test(String(a || '')) || !/^[a-f0-9]+$/i.test(String(b || ''))) return false;
  const left = Buffer.from(String(a), 'hex');
  const right = Buffer.from(String(b), 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

if (WebhookSignatureValidator?.validate && !WebhookSignatureValidator.__relogioExactDataIdPatched) {
  WebhookSignatureValidator.validate = function ({ xSignature, xRequestId, dataId, secret } = {}) {
    const signature = parseMercadoPagoSignature(xSignature);
    const ts = String(signature.ts || '').trim();
    const received = String(signature.v1 || '').trim();
    const secretValue = String(secret || '').trim();
    const exactDataId = String(dataId || '').trim();
    const requestId = String(xRequestId || '').trim();
    if (!ts || !received || !secretValue) throw new Error('Invalid webhook signature: MissingSignatureData');
    let manifest = '';
    if (exactDataId) manifest += `id:${exactDataId};`;
    if (requestId) manifest += `request-id:${requestId};`;
    manifest += `ts:${ts};`;
    const expected = crypto.createHmac('sha256', secretValue).update(manifest).digest('hex');
    if (!safeHexEqual(received, expected)) throw new Error('Invalid webhook signature: SignatureMismatch');
    return true;
  };
  WebhookSignatureValidator.__relogioExactDataIdPatched = true;
}

const originalExpress = express;
if (!originalExpress.__relogioAuthPatched) {
  if (!Preference.prototype.__relogioSignedWebhookPatched) {
    const originalPreferenceCreate = Preference.prototype.create;
    Preference.prototype.create = function (args = {}) {
      if (args?.body?.notification_url) {
        const body = { ...args.body };
        delete body.notification_url;
        args = { ...args, body };
      }
      return originalPreferenceCreate.call(this, args);
    };
    Preference.prototype.__relogioSignedWebhookPatched = true;
  }

  const wrappedExpress = function (...args) {
    const app = originalExpress(...args);

    // Injeta os recursos de cupom somente na página do carrinho, mantendo o HTML
    // base simples e garantindo que o script seja carregado depois do frete.
    app.get('/carrinho.html', (req, res, next) => {
      try {
        const file = path.join(__dirname, 'carrinho.html');
        let html = fs.readFileSync(file, 'utf8');
        if (!html.includes('cart-coupons.css')) html = html.replace('</head>', '<link rel="stylesheet" href="cart-coupons.css">\n</head>');
        if (!html.includes('cart-coupons.js')) html = html.replace('<script src="mercadopago-checkout-client.js"></script>', '<script src="cart-coupons.js"></script>\n<script src="mercadopago-checkout-client.js"></script>');
        res.type('html').send(html);
      } catch (error) { next(error); }
    });

    registerAuthRoutes(app);
    registerMelhorEnvioOAuthRoutes(app);
    registerShippingRoutes(app);
    registerProductDetailsRoutes(app);
    registerCouponRoutes(app);
    registerCasioEnrichmentV2(app);
    registerImageProxy(app);
    registerOrientEnrichment(app);

    app.get('/api/storage-status', (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json(storageStatus());
    });

    app.use('/api/checkout', express.json({ limit: '1mb' }), (req, res, next) => {
      try {
        const user = userFromRequest(req);
        if (!user) return next();
        req.body = req.body || {};
        req.body.payer = {
          ...(req.body.payer || {}),
          nome: user.nome,
          email: user.email,
          telefone: user.telefone || undefined,
          identificacao: user.identificacao || undefined,
          endereco: user.endereco || undefined,
          date_created: user.created_at || undefined
        };
      } catch (error) {
        console.warn('Não foi possível enriquecer o checkout com a conta:', error.message);
      }
      next();
    });

    registerCouponCheckout(app);
    registerMercadoPagoOrdersPix(app);
    registerMercadoPagoClean(app);
    return app;
  };

  Object.assign(wrappedExpress, originalExpress);
  wrappedExpress.__relogioAuthPatched = true;
  require.cache[require.resolve('express')].exports = wrappedExpress;
}