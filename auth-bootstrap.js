const express = require('express');
const { Preference } = require('mercadopago');
const { registerAuthRoutes, userFromRequest } = require('./auth');
const { storageStatus } = require('./persistent-store');
const { registerShippingRoutes } = require('./shipping-routes');
const { registerMelhorEnvioOAuthRoutes } = require('./melhorenvio-oauth-routes');
const { registerProductDetailsRoutes } = require('./product-details-routes');
const { registerCasioEnrichmentV2 } = require('./casio-enrichment-v2');
const { registerImageProxy } = require('./image-proxy');
const { registerOrientEnrichment } = require('./orient-enrichment');
const { registerMercadoPagoOrdersPix } = require('./mercadopago-orders-pix');
const { registerMercadoPagoClean } = require('./mercadopago-clean');

const originalExpress = express;
if (!originalExpress.__relogioAuthPatched) {
  // Checkout Pro: a URL de Webhook configurada no painel da aplicação deve ser a
  // fonte da notificação assinada. Se notification_url for enviada dentro da
  // preferência, ela tem prioridade e pode chegar por um fluxo diferente do
  // segredo configurado no painel. Removemos apenas de Preference.create;
  // pagamentos PIX usam Orders API e o tópico Order configurado no painel.
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

    registerAuthRoutes(app);
    registerMelhorEnvioOAuthRoutes(app);
    registerShippingRoutes(app);
    registerProductDetailsRoutes(app);

    // A rota Casio v2 precisa ser registrada antes da implementação antiga,
    // pois ambas usam /api/product-enrichment. O Express usa a primeira rota compatível.
    registerCasioEnrichmentV2(app);
    registerImageProxy(app);
    registerOrientEnrichment(app);

    app.get('/api/storage-status', (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json(storageStatus());
    });

    // A conta autenticada no backend é a fonte de verdade para os dados do cliente.
    // O frontend continua enviando apenas o mínimo necessário para compatibilidade.
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

    // PIX usa a API Orders recomendada pelo Mercado Pago. Esta rota vem antes
    // do Checkout Pro para interceptar somente metodo=pix; cartão continua igual.
    // O payer enviado é sempre o cliente real/autenticado; não há mais substituição
    // automática por usuário de sandbox nesta branch.
    registerMercadoPagoOrdersPix(app);

    // Checkout Pro limpo continua responsável por cartão e pelas rotas compatíveis.
    registerMercadoPagoClean(app);

    return app;
  };

  Object.assign(wrappedExpress, originalExpress);
  wrappedExpress.__relogioAuthPatched = true;
  require.cache[require.resolve('express')].exports = wrappedExpress;
}