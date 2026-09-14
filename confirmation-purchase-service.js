const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { flushPersistentStore } = require('./persistent-store');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const REQUESTS = path.join(DATA, 'availability-requests.json');
const DEFAULT_RELEASE_HOURS = 48;
const CLAIM_HOLD_MS = 2 * 60 * 60 * 1000;

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

async function persistRequests(requests) {
  writeRequests(requests);
  await flushPersistentStore();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function customerMatches(request, customer) {
  if (!request || !customer) return false;
  const requestUserId = String(request?.customer?.user_id || '').trim();
  const customerUserId = String(customer?.id || customer?.user_id || '').trim();
  if (requestUserId && customerUserId && requestUserId === customerUserId) return true;
  const requestEmail = normalizeEmail(request?.customer?.email);
  const customerEmail = normalizeEmail(customer?.email);
  return Boolean(requestEmail && customerEmail && requestEmail === customerEmail);
}

function purchaseState(request, now = Date.now()) {
  const purchase = request?.purchase_authorization;
  if (!purchase || typeof purchase !== 'object') return { active: false, reason: 'not_released' };
  if (purchase.revoked_at) return { active: false, reason: 'revoked' };
  if (purchase.completed_at) return { active: false, reason: 'completed' };
  const expiresAt = new Date(purchase.expires_at || 0).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return { active: false, reason: 'expired' };
  if (purchase.claimed_order_id) {
    const claimedAt = new Date(purchase.claimed_at || 0).getTime();
    if (Number.isFinite(claimedAt) && claimedAt > now - CLAIM_HOLD_MS) {
      return { active: false, reason: 'claimed' };
    }
  }
  return { active: true, reason: 'active' };
}

function customerAuthorization(productId, customer, token = '', allowedClaimId = '') {
  const normalizedToken = String(token || '').trim();
  const normalizedClaim = String(allowedClaimId || '').trim();
  const requests = readRequests();
  const matches = requests
    .filter(request => Number(request?.product?.id) === Number(productId))
    .filter(request => customerMatches(request, customer))
    .filter(request => String(request?.status || '') === 'confirmed_available')
    .filter(request => {
      const purchase = request?.purchase_authorization || {};
      if (normalizedToken && String(purchase.token || '') !== normalizedToken) return false;
      if (normalizedClaim && String(purchase.claimed_order_id || '') === normalizedClaim) {
        if (purchase.revoked_at || purchase.completed_at) return false;
        const expiresAt = new Date(purchase.expires_at || 0).getTime();
        return Number.isFinite(expiresAt) && expiresAt > Date.now();
      }
      return purchaseState(request).active;
    })
    .sort((a, b) => new Date(b?.purchase_authorization?.released_at || b?.updated_at || 0) - new Date(a?.purchase_authorization?.released_at || a?.updated_at || 0));

  const request = matches[0];
  if (!request) return null;
  return {
    id: String(request.id),
    product_id: Number(request?.product?.id || 0),
    quantity: Math.max(1, Number(request?.purchase_authorization?.quantity || 1)),
    expires_at: request?.purchase_authorization?.expires_at || null,
    token: String(request?.purchase_authorization?.token || '')
  };
}

function customerPurchases(customer) {
  return readRequests()
    .filter(request => customerMatches(request, customer))
    .map(request => {
      const purchase = request?.purchase_authorization || null;
      const state = purchaseState(request);
      return {
        request_id: String(request?.id || ''),
        status: String(request?.status || 'pending'),
        product_id: Number(request?.product?.id || 0),
        product_name: String(request?.product?.nome || ''),
        product_sku: String(request?.product?.sku || ''),
        product_price: Number(request?.product?.preco || 0),
        purchase: purchase ? {
          active: state.active,
          state: state.reason,
          quantity: Math.max(1, Number(purchase.quantity || 1)),
          released_at: purchase.released_at || null,
          expires_at: purchase.expires_at || null,
          token: state.active ? String(purchase.token || '') : '',
          claimed_order_id: state.reason === 'claimed' ? purchase.claimed_order_id || null : null,
          completed_at: purchase.completed_at || null
        } : null
      };
    })
    .sort((a, b) => String(b.request_id).localeCompare(String(a.request_id)));
}

async function releasePurchase(requestId, options = {}) {
  const requests = readRequests();
  const index = requests.findIndex(item => String(item?.id || '') === String(requestId || ''));
  if (index < 0) {
    const error = new Error('Solicitação não encontrada.');
    error.status = 404;
    throw error;
  }

  const existingState = purchaseState(requests[index]);
  if (existingState.reason === 'claimed') {
    const error = new Error('Este cliente já iniciou a compra. Aguarde o resultado do pagamento.');
    error.status = 409;
    throw error;
  }
  if (existingState.reason === 'completed') {
    const error = new Error('Esta confirmação já foi utilizada em uma compra concluída.');
    error.status = 409;
    throw error;
  }

  const hours = Math.max(1, Math.min(168, Number(options.hours) || DEFAULT_RELEASE_HOURS));
  const quantity = Math.max(1, Math.min(9, Number(options.quantity) || 1));
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
  const changed = requests[index].status !== 'confirmed_available';

  requests[index] = {
    ...requests[index],
    status: 'confirmed_available',
    purchase_authorization: {
      token: crypto.randomBytes(18).toString('base64url'),
      quantity,
      released_at: nowIso,
      expires_at: expiresAt,
      claimed_order_id: null,
      claimed_at: null,
      completed_at: null,
      revoked_at: null
    },
    history: changed
      ? [...(Array.isArray(requests[index].history) ? requests[index].history : []), { status: 'confirmed_available', at: nowIso }]
      : requests[index].history,
    updated_at: nowIso
  };

  await persistRequests(requests);
  return requests[index];
}

async function revokePurchase(requestId) {
  const requests = readRequests();
  const index = requests.findIndex(item => String(item?.id || '') === String(requestId || ''));
  if (index < 0) {
    const error = new Error('Solicitação não encontrada.');
    error.status = 404;
    throw error;
  }

  const current = requests[index];
  if (!current.purchase_authorization) return current;
  const state = purchaseState(current);
  if (state.reason === 'claimed') {
    const error = new Error('A compra já foi iniciada. Aguarde o resultado do pagamento antes de revogar.');
    error.status = 409;
    throw error;
  }
  if (state.reason === 'completed') return current;

  const nowIso = new Date().toISOString();
  requests[index] = {
    ...current,
    status: current.status === 'confirmed_available' ? 'contacted' : current.status,
    purchase_authorization: {
      ...current.purchase_authorization,
      revoked_at: nowIso,
      claimed_order_id: null,
      claimed_at: null
    },
    history: current.status === 'confirmed_available'
      ? [...(Array.isArray(current.history) ? current.history : []), { status: 'contacted', at: nowIso }]
      : current.history,
    updated_at: nowIso
  };
  await persistRequests(requests);
  return requests[index];
}

function confirmationItems(items) {
  return (Array.isArray(items) ? items : []).filter(item => String(item?.disponibilidade || '') === 'mediante_confirmacao');
}

async function claimPurchases(items, customer, orderId) {
  const targetItems = confirmationItems(items);
  if (!targetItems.length) return [];
  const requests = readRequests();
  const claims = [];

  for (const item of targetItems) {
    const requestId = String(item?.confirmation_request_id || '');
    const request = requests.find(candidate => String(candidate?.id || '') === requestId);
    const sameClaim = request && String(request?.purchase_authorization?.claimed_order_id || '') === String(orderId || '');
    if (!request || !customerMatches(request, customer) || (!sameClaim && !purchaseState(request).active)) {
      const error = new Error(`${item?.nome || 'Este produto'} não possui mais uma liberação de compra válida para esta conta.`);
      error.status = 409;
      error.code = 'confirmation_purchase_not_available';
      throw error;
    }
    const allowed = Math.max(1, Number(request?.purchase_authorization?.quantity || 1));
    if (Number(item?.quantidade || 1) > allowed) {
      const error = new Error(`A confirmação de ${item?.nome || 'este produto'} foi liberada para ${allowed} unidade(s).`);
      error.status = 409;
      error.code = 'confirmation_quantity_exceeded';
      throw error;
    }
    claims.push(request);
  }

  const nowIso = new Date().toISOString();
  claims.forEach(request => {
    request.purchase_authorization = {
      ...request.purchase_authorization,
      claimed_order_id: String(orderId),
      claimed_at: request.purchase_authorization?.claimed_at || nowIso
    };
    request.updated_at = nowIso;
  });
  await persistRequests(requests);
  return claims.map(request => String(request.id));
}

async function rebindClaims(oldId, newId) {
  const from = String(oldId || '');
  const to = String(newId || '');
  if (!from || !to) return 0;
  const requests = readRequests();
  let changed = 0;
  const nowIso = new Date().toISOString();
  requests.forEach(request => {
    const purchase = request?.purchase_authorization;
    if (!purchase || String(purchase.claimed_order_id || '') !== from || purchase.completed_at) return;
    request.purchase_authorization = {
      ...purchase,
      claimed_order_id: to,
      claimed_at: purchase.claimed_at || nowIso
    };
    request.updated_at = nowIso;
    changed += 1;
  });
  if (changed) await persistRequests(requests);
  return changed;
}

async function releaseClaimsForOrder(orderId) {
  const id = String(orderId || '');
  if (!id) return 0;
  const requests = readRequests();
  let changed = 0;
  const nowIso = new Date().toISOString();
  requests.forEach(request => {
    const purchase = request?.purchase_authorization;
    if (!purchase || String(purchase.claimed_order_id || '') !== id || purchase.completed_at) return;
    request.purchase_authorization = {
      ...purchase,
      claimed_order_id: null,
      claimed_at: null
    };
    request.updated_at = nowIso;
    changed += 1;
  });
  if (changed) await persistRequests(requests);
  return changed;
}

async function completeClaimsForOrder(orderId) {
  const id = String(orderId || '');
  if (!id) return 0;
  const requests = readRequests();
  let changed = 0;
  const nowIso = new Date().toISOString();
  requests.forEach(request => {
    const purchase = request?.purchase_authorization;
    if (!purchase || String(purchase.claimed_order_id || '') !== id || purchase.completed_at) return;
    request.purchase_authorization = {
      ...purchase,
      completed_at: nowIso
    };
    if (request.status !== 'closed') {
      request.status = 'closed';
      request.history = [...(Array.isArray(request.history) ? request.history : []), { status: 'closed', at: nowIso }];
    }
    request.updated_at = nowIso;
    changed += 1;
  });
  if (changed) await persistRequests(requests);
  return changed;
}

module.exports = {
  DEFAULT_RELEASE_HOURS,
  customerAuthorization,
  customerPurchases,
  releasePurchase,
  revokePurchase,
  claimPurchases,
  rebindClaims,
  releaseClaimsForOrder,
  completeClaimsForOrder
};
