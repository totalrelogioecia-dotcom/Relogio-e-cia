const { userFromRequest } = require('./auth');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function orderBelongsToUser(order, user) {
  const orderEmail = normalizeEmail(order?.payer?.email);
  const userEmail = normalizeEmail(user?.email);
  return Boolean(orderEmail && userEmail && orderEmail === userEmail);
}

function customerCanAccessOrder(req, order) {
  return orderBelongsToUser(order, userFromRequest(req));
}

function sendOrderNotFound(res) {
  return res.status(404).json({ error: 'Pedido não encontrado.' });
}

module.exports = {
  customerCanAccessOrder,
  normalizeEmail,
  orderBelongsToUser,
  sendOrderNotFound
};
