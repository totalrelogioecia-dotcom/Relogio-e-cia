const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const { Preference, WebhookSignatureValidator } = require('mercadopago');
const { registerAuthRoutes, userFromRequest } = require('./auth');
const { registerCheckoutProfileRoutes, validCpf } = require('./checkout-profile');
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
const { registerReturnRequestRoutes } = require('./return-requests');
const { queueOrderReceivedEmail } = require('./order-email');

const checkoutContext = new AsyncLocalStorage();

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function preferencePayer(payer) {
  if (!payer || typeof payer !== 'object') return null;

  const parts = String(payer.nome || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  const name = (parts.shift() || '').slice(0, 80);
  const surname = parts.join(' ').slice(0, 120);
  const email = String(payer.email || '').trim().toLowerCase().slice(0, 180);

  if (!email && !name) return null;

  const result = {};
  if (name) result.name = name;
  if (surname) result.surname = surname;
  if (email) result.email = email;

  const areaCode = digits(payer.telefone?.area_code).slice(0, 4);
  const phoneNumber = digits(payer.telefone?.number).slice(0, 15);
  if (areaCode && phoneNumber) {
    result.phone = { area_code: areaCode, number: phoneNumber };
  }

  const identificationType = String(payer.identificacao?.type || '').trim().toUpperCase().slice(0, 20);
  const identificationNumber = digits(payer.identificacao?.number).slice(0, 30);
  if (identificationType && identificationNumber) {
    result.identification = { type: identificationType, number: identificationNumber };
  }

  const address = payer.endereco || {};
  const zipCode = digits(address.zip_code).slice(0, 8);
  const streetName = String(address.street_name || '').trim().slice(0, 120);
  const streetNumber = String(address.street_number || '').trim().slice(0, 20);
  if (zipCode && streetName && streetNumber) {
    result.address = {
      zip_code: zipCode,
      street_name: streetName,
      street_number: streetNumber
    };
  }

  const dateCreated = String(payer.date_created || '').trim();
  if (dateCreated) result.date_created = dateCreated;

  return result;
}

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
    Preference.prototype.create = async function (args = {}) {
      if (args?.body) {
        const body = { ...args.body };

        // O webhook principal é configurado no painel do Mercado Pago.
        // Mantemos a preferência sem notification_url para evitar rotas concorrentes.
        if (body.notification_url) delete body.notification_url;

        // Durante o checkout, aproveita os dados reais já cadastrados na conta
        // para enriquecer a preferência do Checkout Pro. Isso ajuda a análise
        // antifraude sem inventar dados do comprador.
        const contextualPayer = preferencePayer(checkoutContext.getStore()?.payer);
        if (contextualPayer) {
          body.payer = {
            ...(body.payer || {}),
            ...contextualPayer
          };
        }

        args = { ...args, body };
      }

      const response = await originalPreferenceCreate.call(this, args);
      const context = checkoutContext.getStore();
      if (context && response?.init_point) context.initPoint = String(response.init_point);
      return response;
    };
    Preference.prototype.__relogioSignedWebhookPatched = true;
  }

  const wrappedExpress = function (...args) {
    const app = originalExpress(...args);

    function injectLegalFooterScript(html) {
      if (!html.includes('legal-footer.js')) {
        html = html.replace('</body>', '<script src="legal-footer.js"></script>\n</body>');
      }
      return html;
    }

    // Injeta os recursos de cupom somente na página do carrinho, mantendo o HTML
    // base simples e garantindo que o script seja carregado depois do frete.
    app.get('/carrinho.html', (req, res, next) => {
      try {
        const file = path.join(__dirname, 'carrinho.html');
        let html = fs.readFileSync(file, 'utf8');
        if (!html.includes('cart-coupons.css')) html = html.replace('</head>', '<link rel="stylesheet" href="cart-coupons.css">\n</head>');
        if (!html.includes('cart-coupons.js')) html = html.replace('<script src="mercadopago-checkout-client.js"></script>', '<script src="cart-coupons.js"></script>\n<script src="mercadopago-checkout-client.js"></script>');
        html = injectLegalFooterScript(html);
        res.type('html').send(html);
      } catch (error) { next(error); }
    });

    // As páginas públicas principais recebem o mesmo bloco legal no rodapé.
    // Isso evita que Política de Privacidade, Termos e pós-venda apareçam só na Home.
    const legalPages = [
      'produtos.html',
      'produto.html',
      'sobre.html',
      'conta.html',
      'trocas-estornos.html',
      'politica-de-privacidade.html',
      'termos-de-uso.html'
    ];
    for (const page of legalPages) {
      app.get(`/${page}`, (req, res, next) => {
        try {
          const file = path.join(__dirname, page);
          const html = injectLegalFooterScript(fs.readFileSync(file, 'utf8'));
          res.type('html').send(html);
        } catch (error) { next(error); }
      });
    }

    registerAuthRoutes(app);
    registerCheckoutProfileRoutes(app);
    registerReturnRequestRoutes(app);
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
        if (user) {
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

          if (!validCpf(req.body.payer?.identificacao?.number)) {
            return res.status(409).json({
              error: 'Para finalizar a compra, informe um CPF válido.',
              code: 'cpf_required'
            });
          }
        }
      } catch (error) {
        console.warn('Não foi possível enriquecer o checkout com a conta:', error.message);
      }

      const originalJson = res.json.bind(res);
      const context = { payer: req.body?.payer || null, initPoint: null };

      res.json = payload => {
        if (payload && typeof payload === 'object' && payload.preference_id && !payload.init_point && context.initPoint) {
          payload = { ...payload, init_point: context.initPoint };
        }
        const response = originalJson(payload);
        if (payload && typeof payload === 'object' && payload.order_id) {
          queueOrderReceivedEmail(payload.order_id);
        }
        return response;
      };

      checkoutContext.run(context, () => next());
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
