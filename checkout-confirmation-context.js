const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function createCheckoutContext(customer) {
  return {
    attempt_id: `CHK-${crypto.randomUUID()}`,
    customer: customer || null
  };
}

function runCheckoutContext(context, callback) {
  return storage.run(context || null, callback);
}

function currentCheckoutContext() {
  return storage.getStore() || null;
}

module.exports = {
  createCheckoutContext,
  runCheckoutContext,
  currentCheckoutContext
};
