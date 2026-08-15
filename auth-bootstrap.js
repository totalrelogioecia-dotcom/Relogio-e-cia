const express = require('express');
const { registerAuthRoutes, userFromRequest } = require('./auth');
const { storageStatus } = require('./persistent-store');
const { registerMercadoPagoV2 } = require('./mercadopago-v2');

const originalExpress = express;
if (!originalExpress.__relogioAuthPatched) {
  const wrappedExpress = function (...args) {
    const app = originalExpress(...args);

    registerAuthRoutes(app);

    app.get('/api/storage-status', (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json(storageStatus());
    });

    // Hidrata o checkout com os dados da conta autenticada antes de criar o pagamento.
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

    // Nova integração do Mercado Pago. Ela é registrada antes das rotas legadas
    // do server.js e, portanto, passa a responder /api/checkout e o webhook.
    registerMercadoPagoV2(app);

    return app;
  };

  Object.assign(wrappedExpress, originalExpress);
  wrappedExpress.__relogioAuthPatched = true;
  require.cache[require.resolve('express')].exports = wrappedExpress;
}
