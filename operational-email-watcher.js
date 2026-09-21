const fs = require('fs');
const path = require('path');
const { queuePaymentApprovedEmail, isApproved } = require('./order-email');
const { queueInvoiceEmail } = require('./invoice-email');
const { queueShippingEmail } = require('./shipping-email');
const { queueOrderCancellationEmail } = require('./order-cancellation-email');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const ORDERS = path.join(DATA, 'orders.json');
let started = false;
let scanning = false;
let scanQueued = false;

function readOrders() {
  try {
    const value = JSON.parse(fs.readFileSync(ORDERS, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function eligibleShipping(order) {
  return ['shipped', 'ready_for_pickup'].includes(String(order?.fulfillment?.status || '').toLowerCase());
}

async function scanOperationalEmails() {
  if (scanning) {
    scanQueued = true;
    return;
  }
  scanning = true;
  try {
    const orders = readOrders();
    for (const order of orders) {
      const orderId = String(order?.id || '');
      if (!orderId || !order?.payer?.email) continue;

      if (isApproved(order) && !order?.notifications?.payment_approved_email_sent_at) {
        queuePaymentApprovedEmail(orderId);
      }
      if (String(order?.invoice?.status || '').toLowerCase() === 'emitted') {
        queueInvoiceEmail(orderId);
      }
      if (eligibleShipping(order)) {
        queueShippingEmail(orderId);
      }
      if (order?.store_cancellation?.status === 'refunded' && !order?.notifications?.store_cancellation_email_sent_at) {
        queueOrderCancellationEmail(orderId);
      }
    }
  } finally {
    scanning = false;
    if (scanQueued) {
      scanQueued = false;
      setTimeout(() => scanOperationalEmails().catch(() => {}), 100);
    }
  }
}

function startOperationalEmailWatcher() {
  if (started) return;
  started = true;

  fs.watchFile(ORDERS, { interval: 1500 }, (current, previous) => {
    if (current.mtimeMs === previous.mtimeMs && current.size === previous.size) return;
    scanOperationalEmails().catch(error => {
      console.warn('Falha não bloqueante ao verificar e-mails operacionais:', error.message);
    });
  });

  setTimeout(() => {
    scanOperationalEmails().catch(error => {
      console.warn('Falha não bloqueante na verificação inicial de e-mails operacionais:', error.message);
    });
  }, 1800).unref?.();
}

module.exports = { startOperationalEmailWatcher, scanOperationalEmails };
