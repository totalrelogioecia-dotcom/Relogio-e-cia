const fs = require('fs');
const path = require('path');
const { flushPersistentStore } = require('./persistent-store');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const REQUESTS = path.join(DATA, 'availability-requests.json');

function readRequests() {
  try {
    const value = JSON.parse(fs.readFileSync(REQUESTS, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeRequests(requests) {
  fs.mkdirSync(path.dirname(REQUESTS), { recursive: true });
  fs.writeFileSync(REQUESTS, JSON.stringify(requests, null, 2), 'utf8');
}

function email(value) {
  return String(value || '').trim().toLowerCase();
}

async function completeConfirmationPurchases(order) {
  const orderId = String(order?.id || '').trim();
  const customerEmail = email(order?.payer?.email);
  const productIds = new Set(
    (Array.isArray(order?.items) ? order.items : [])
      .filter(item => String(item?.disponibilidade || '') === 'mediante_confirmacao')
      .map(item => Number(item?.id || 0))
      .filter(id => Number.isSafeInteger(id) && id > 0)
  );
  if (!orderId || !customerEmail || !productIds.size) return 0;

  const requests = readRequests();
  const nowIso = new Date().toISOString();
  let changed = 0;

  requests.forEach(request => {
    const purchase = request?.purchase_authorization;
    if (!purchase || purchase.completed_at || purchase.revoked_at) return;
    if (!purchase.claimed_order_id) return;
    if (String(request?.status || '') !== 'confirmed_available') return;
    if (!productIds.has(Number(request?.product?.id || 0))) return;
    if (email(request?.customer?.email) !== customerEmail) return;

    request.purchase_authorization = {
      ...purchase,
      claimed_order_id: orderId,
      completed_at: nowIso
    };
    request.status = 'closed';
    request.history = [
      ...(Array.isArray(request.history) ? request.history : []),
      { status: 'closed', at: nowIso }
    ];
    request.updated_at = nowIso;
    changed += 1;
  });

  if (changed) {
    writeRequests(requests);
    await flushPersistentStore();
  }
  return changed;
}

module.exports = { completeConfirmationPurchases };
