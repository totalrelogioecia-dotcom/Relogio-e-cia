const express = require('express');
const crypto = require('crypto');
const { Preference, WebhookSignatureValidator } = require('mercadopago');
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

// O SDK do Mercado Pago pode normalizar o data.id durante a validação. Isso não
// altera IDs numéricos de payment, mas quebra a assinatura dos IDs alfanuméricos
// de Order (ORD...). A documentação do Mercado Pago exige que o manifesto use o
// data.id exatamente como chegou na query string. Mantemos a mesma interface do
// SDK, mas calculamos o HMAC sem alterar maiúsculas/minúsculas do identificador.
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