const { Preference, Payment } = require('mercadopago');

function withWebhooksNotification(body) {
  if (!body || !body.notification_url) return body;

  const nextBody = { ...body };
  try {
    const url = new URL(String(body.notification_url));
    url.searchParams.set('source_news', 'webhooks');
    nextBody.notification_url = url.toString();
  } catch {
    const value = String(body.notification_url);
    const separator = value.includes('?') ? '&' : '?';
    if (!/[?&]source_news=/i.test(value)) {
      nextBody.notification_url = `${value}${separator}source_news=webhooks`;
    }
  }
  return nextBody;
}

function configureCheckoutProPayerFilter() {
  if (!Preference.prototype.__relogioPayerFilterPatched) {
    const originalPreferenceCreate = Preference.prototype.create;

    Preference.prototype.create = async function createCheckoutPreference(args = {}) {
      const nextArgs = { ...args };
      if (args?.body) {
        nextArgs.body = withWebhooksNotification(args.body);
        if (Object.prototype.hasOwnProperty.call(nextArgs.body, 'payer')) {
          delete nextArgs.body.payer;
        }
      }

      const response = await originalPreferenceCreate.call(this, nextArgs);

      // Durante os testes do Checkout Pro, usamos explicitamente o endereço
      // sandbox retornado pelo próprio Mercado Pago. Quando a loja for para
      // produção, este pequeno override deve ser removido para voltar ao
      // init_point produtivo.
      if (response?.sandbox_init_point) {
        console.log('Mercado Pago Checkout Pro: usando sandbox_init_point para teste.');
        return { ...response, init_point: response.sandbox_init_point };
      }

      return response;
    };

    Preference.prototype.__relogioPayerFilterPatched = true;
  }

  if (!Payment.prototype.__relogioWebhooksPatched) {
    const originalPaymentCreate = Payment.prototype.create;

    Payment.prototype.create = async function createPaymentWithWebhooks(args = {}) {
      const nextArgs = { ...args };
      if (args?.body) nextArgs.body = withWebhooksNotification(args.body);
      return originalPaymentCreate.call(this, nextArgs);
    };

    Payment.prototype.__relogioWebhooksPatched = true;
  }
}

module.exports = { configureCheckoutProPayerFilter };
