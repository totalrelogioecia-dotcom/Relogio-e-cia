const express = require('express');
const { registerAuthRoutes, userFromRequest } = require('./auth');
const { storageStatus } = require('./persistent-store');
const { registerMercadoPagoV2 } = require('./mercadopago-v2');
const { registerMercadoPagoWebhookCompat } = require('./mercadopago-webhook-compat');
const { registerShippingRoutes } = require('./shipping-routes');
const { registerCheckoutWithShipping } = require('./checkout-with-shipping');
const { registerMelhorEnvioOAuthRoutes } = require('./melhorenvio-oauth-routes');
const { registerProductDetailsRoutes } = require('./product-details-routes');
const { registerImageProxy } = require('./image-proxy');

const originalExpress = express;
if (!originalExpress.__relogioAuthPatched) {
  const wrappedExpress = function (...args) {
    const app = originalExpress(...args);

    registerAuthRoutes(app);
    registerMelhorEnvioOAuthRoutes(app);
    registerShippingRoutes(app);
    registerProductDetailsRoutes(app);
    registerImageProxy(app);

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

    registerCheckoutWithShipping(app);
    registerMercadoPagoWebhookCompat(app);
    registerMercadoPagoV2(app);

    return app;
  };

  Object.assign(wrappedExpress, originalExpress);
  wrappedExpress.__relogioAuthPatched = true;
  require.cache[require.resolve('express')].exports = wrappedExpress;
}
