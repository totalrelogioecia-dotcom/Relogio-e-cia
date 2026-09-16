require('dotenv').config();

const express = require('express');
const { collectStoreHealth } = require('./store-health');
const { authenticatedRequest } = require('./admin-session');

const originalExpress = express;
if (!originalExpress.__relogioStoreHealthPatched) {
  const wrappedExpress = function (...args) {
    const app = originalExpress(...args);

    app.get('/api/admin/store-health', (req, res) => {
      res.set('Cache-Control', 'no-store');
      const payload = authenticatedRequest(req);
      if (!payload) {
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
