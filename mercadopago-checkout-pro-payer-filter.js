const { Preference } = require('mercadopago');

function configureCheckoutProPayerFilter() {
  if (Preference.prototype.__relogioPayerFilterPatched) return;

  const originalCreate = Preference.prototype.create;

  Preference.prototype.create = async function createWithoutPayer(args = {}) {
    const nextArgs = { ...args };

    if (args?.body && Object.prototype.hasOwnProperty.call(args.body, 'payer')) {
      nextArgs.body = { ...args.body };
      delete nextArgs.body.payer;
    }

    return originalCreate.call(this, nextArgs);
  };

  Preference.prototype.__relogioPayerFilterPatched = true;
}

module.exports = { configureCheckoutProPayerFilter };
