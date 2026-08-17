const express = require('express');
const { registerAuthRoutes, userFromRequest } = require('./auth');
const { storageStatus } = require('./persistent-store');
const { registerMercadoPagoV2 } = require('./mercadopago-v2');
const { registerMercadoPagoWebhookCompat } = require('./mercadopago-webhook-compat');
const { registerShippingRoutes } = require('./shipping-routes');
const { registerCheckoutWithShipping } = require('./checkout-with-shipping');
const { registerMelhorEnvioOAuthRoutes } = require('./melhorenvio-oauth-routes');

const originalExpress = express;
if (!originalExpress.__relogioAuthPatched) {
  const wrappedExpress = function (...args) {
    const app = originalExpress(...args);

    registerAuthRoutes(app);
    registerMelhorEnvioOAuthRoutes(app);
    registerShippingRoutes(app);

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

    // Quando houver uma opção de frete selecionada, esta rota recalcula o valor
    // no servidor e inclui o custo no PIX ou no Checkout Pro.
    registerCheckoutWithShipping(app);

    // O Mercado Pago pode enviar em produção uma notificação assinada com data.id,
    // porém sem o campo type. Essa camada trata apenas essa variação observada,
    // antes da rota principal, mantendo a validação HMAC.
    registerMercadoPagoWebhookCompat(app);

    // Nova integração do Mercado Pago. Ela é registrada antes das rotas legadas
    // do server.js e, portanto, passa a responder /api/checkout e o webhook.
    registerMercadoPagoV2(app);

    return app;
  };

  Object.assign(wrappedExpress, originalExpress);
  wrappedExpress.__relogioAuthPatched = true;
  require.cache[require.resolve('express')].exports = wrappedExpress;
}
