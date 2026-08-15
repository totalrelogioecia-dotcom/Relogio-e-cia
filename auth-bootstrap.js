const express = require('express');
const { registerAuthRoutes, userFromRequest } = require('./auth');
const { storageStatus } = require('./persistent-store');

const originalExpress = express;
if (!originalExpress.__relogioAuthPatched) {
  const wrappedExpress = function (...args) {
    const app = originalExpress(...args);

    registerAuthRoutes(app);

    app.get('/api/storage-status', (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json(storageStatus());
    });

    // O server.js registra /api/checkout depois deste preload. Aqui hidratamos
    // os dados do comprador com a conta autenticada antes de criar o pagamento.
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

        if (!req.body.shipping && user.endereco) {
          req.body.shipping = {
            zip_code: user.endereco.zip_code,
            street_name: user.endereco.street_name,
            street_number: user.endereco.street_number,
            city_name: user.endereco.city_name,
            state_name: user.endereco.state_name || user.endereco.state_code,
            local_pickup: false
          };
        }
      } catch (error) {
        console.warn('Não foi possível enriquecer o checkout com a conta:', error.message);
      }
      next();
    });

    return app;
  };

  Object.assign(wrappedExpress, originalExpress);
  wrappedExpress.__relogioAuthPatched = true;
  require.cache[require.resolve('express')].exports = wrappedExpress;
}
