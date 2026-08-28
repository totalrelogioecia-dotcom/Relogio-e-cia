const express = require('express');
const fs = require('fs');
const path = require('path');
const { registerAuthRoutes, userFromRequest } = require('./auth');
const { registerCheckoutProfileRoutes, validCpf } = require('./checkout-profile');
const { registerCustomerAddressRoutes } = require('./customer-address-routes');
const { resolveUserAddress, stripMeta } = require('./customer-address-service');
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

/*
 * Este bootstrap continua responsável por autenticar a conta do cliente e
 * enriquecer o checkout com dados confiáveis do servidor. Ele NÃO altera
 * protótipos do SDK do Mercado Pago. Payer, Device ID e validação de Webhook
 * são tratados explicitamente nos módulos de pagamento.
 */
const originalExpress = express;

if (!originalExpress.__relogioAuthPatched) {
  const wrappedExpress = function (...args) {
    const app = originalExpress(...args);

    function injectLegalFooterScript(html) {
      if (!html.includes('legal-footer.js')) {
        html = html.replace('</body>', '<script src="legal-footer.js"></script>\n</body>');
      }
      return html;
    }

    app.get('/carrinho.html', (req, res, next) => {
      try {
        const file = path.join(__dirname, 'carrinho.html');
        let html = fs.readFileSync(file, 'utf8');
        if (!html.includes('cart-coupons.css')) {
          html = html.replace('</head>', '<link rel="stylesheet" href="cart-coupons.css">\n</head>');
        }
        if (!html.includes('cart-coupons.js')) {
          html = html.replace(
            '<script src="mercadopago-checkout-client.js"></script>',
            '<script src="cart-coupons.js"></script>\n<script src="mercadopago-checkout-client.js"></script>'
          );
        }
        html = injectLegalFooterScript(html);
        res.type('html').send(html);
      } catch (error) {
        next(error);
      }
    });

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
        } catch (error) {
          next(error);
        }
      });
    }

    registerAuthRoutes(app);
    registerCustomerAddressRoutes(app);
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
        if (!user) {
          return res.status(401).json({
            error: 'Sua sessão expirou. Entre novamente na conta para finalizar a compra.',
            code: 'authentication_required'
          });
        }

        req.body = req.body || {};
        const requestedAddressId = String(
          req.body?.shipping?.address_id || req.body?.delivery_address_id || ''
        ).trim();
        const deliveryAddress = resolveUserAddress(user, requestedAddressId);

        if (requestedAddressId && !deliveryAddress) {
          return res.status(409).json({
            error: 'O endereço de entrega selecionado não foi encontrado na sua conta.',
            code: 'delivery_address_invalid'
          });
        }

        if (!deliveryAddress) {
          return res.status(409).json({
            error: 'Cadastre um endereço de entrega antes de finalizar a compra.',
            code: 'delivery_address_required'
          });
        }

        req.body.shipping = req.body.shipping || {};
        req.body.shipping.address_id = deliveryAddress.id;
        req.body.payer = {
          nome: user.nome,
          email: user.email,
          telefone: user.telefone || undefined,
          identificacao: user.identificacao || undefined,
          endereco: stripMeta(deliveryAddress),
          endereco_id: deliveryAddress.id,
          date_created: user.created_at || undefined
        };

        if (!validCpf(req.body.payer?.identificacao?.number)) {
          return res.status(409).json({
            error: 'Para finalizar a compra, informe um CPF válido.',
            code: 'cpf_required'
          });
        }
      } catch (error) {
        console.error('Não foi possível validar a conta no checkout:', error.message);
        return res.status(500).json({
          error: 'Não foi possível validar sua conta para o pagamento. Tente novamente.',
          code: 'checkout_account_validation_failed'
        });
      }

      const originalJson = res.json.bind(res);
      res.json = payload => {
        const response = originalJson(payload);
        if (payload && typeof payload === 'object' && payload.order_id) {
          queueOrderReceivedEmail(payload.order_id);
        }
        return response;
      };

      return next();
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
