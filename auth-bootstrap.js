const express = require('express');
const { registerAuthRoutes } = require('./auth');
const originalExpress = express;
if (!originalExpress.__relogioAuthPatched) {
  const wrappedExpress = function (...args) {
    const app = originalExpress(...args);
    registerAuthRoutes(app);
    return app;
  };
  Object.assign(wrappedExpress, originalExpress);
  wrappedExpress.__relogioAuthPatched = true;
  require.cache[require.resolve('express')].exports = wrappedExpress;
}
