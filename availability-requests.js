const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { flushPersistentStore } = require('./persistent-store');
const {
  customerPurchases,
  releasePurchase,
  revokePurchase
} = require('./confirmation-purchase-service');
const {
  MEDIANTE_CONFIRMACAO,
  readDetails,
  availabilityForProduct
} = require('./product-availability-service');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const PRODUCTS = path.join(DATA, 'products.json');
const REQUESTS = path.join(DATA, 'availability-requests.json');
const ORDERS = path.join(DATA, 'orders.json');
const ADMIN_HTML = path.join(__dirname, 'admin.html');

const REQUEST_STATUSES = Object.freeze({
  pending: 'Nova solicitação',
  contacted: 'Cliente contatado',
  confirmed_available: 'Disponibilidade confirmada',
  unavailable: 'Indisponível',
  closed: 'Encerrada'
});

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

async function persistRequests(requests) {
  write(REQUESTS, requests);
  await flushPersistentStore();
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function validAdminToken(value) {
  try {
    const [body, sig] = String(value || '').split('.');
    if (!body || !sig) return false;
    const secret = String(process.env.ADMIN_SESSION_SECRET || '').trim();
    if (!secret) return false;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (!safeEqual(sig, expected)) return false;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.role === 'admin' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

function admin(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!validAdminToken(token)) return res.status(401).json({ error: 'Sessão administrativa inválida ou expirada.' });
  next();
}

function normalizeRequestStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (!REQUEST_STATUSES[status]) {
    const error = new Error('Status da solicitação inválido.');
    error.status = 400;
    throw error;
  }
  return status;
}

function cleanNote(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 500);
}

function phoneDigits(user) {
  const area = String(user?.telefone?.area_code || '').replace(/\D/g, '');
  const number = String(user?.telefone?.number || '').replace(/\D/g, '');
  return `${area}${number}`.slice(0, 20);
}

function purchaseState(request) {
  const purchase = request?.purchase_authorization;
  if (!purchase || typeof purchase !== 'object') return 'not_released';
  if (purchase.revoked_at) return 'revoked';
  if (purchase.completed_at) return 'completed';
  const expiresAt = new Date(purchase.expires_at || 0).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return 'expired';
  if (purchase.claimed_order_id) return 'claimed';
  return 'active';
}

function requestSnapshot(request) {
  const purchase = request?.purchase_authorization || null;
  const state = purchaseState(request);
  const token = purchase && ['active', 'claimed'].includes(state) ? String(purchase.token || '') : '';
  const productId = Number(request?.product?.id || 0);
  return {
    id: String(request?.id || ''),
    status: String(request?.status || 'pending'),
    status_label: REQUEST_STATUSES[String(request?.status || 'pending')] || String(request?.status || ''),
    product: {
      id: productId,
      nome: String(request?.product?.nome || ''),
      marca: String(request?.product?.marca || ''),
      sku: String(request?.product?.sku || ''),
      preco: Number(request?.product?.preco || 0)
    },
    customer: {
      nome: String(request?.customer?.nome || ''),
      email: String(request?.customer?.email || ''),
      telefone: String(request?.customer?.telefone || '')
    },
    source: String(request?.source || ''),
    admin_note: String(request?.admin_note || ''),
    purchase: purchase ? {
      state,
      active: state === 'active',
      quantity: Math.max(1, Number(purchase.quantity || 1)),
      released_at: purchase.released_at || null,
      expires_at: purchase.expires_at || null,
      claimed_order_id: purchase.claimed_order_id || null,
      completed_at: purchase.completed_at || null,
      revoked_at: purchase.revoked_at || null,
      link: token ? `/produto.html?id=${encodeURIComponent(productId)}&confirmacao=${encodeURIComponent(token)}` : null
    } : null,
    created_at: request?.created_at || null,
    updated_at: request?.updated_at || null
  };
}

function storeCancellationSnapshot(order) {
  const cancellation = order?.store_cancellation || {};
  return {
    order_id: String(order?.id || ''),
    customer: {
      nome: String(order?.payer?.nome || ''),
      email: String(order?.payer?.email || '')
    },
    total: Number(order?.total || 0),
    order_status: String(order?.status || ''),
    payment_status: String(order?.payment_status || ''),
    cancellation: {
      status: String(cancellation.status || ''),
      reason_label: String(cancellation.reason_label || ''),
      details: String(cancellation.details || ''),
      requested_at: cancellation.requested_at || null,
      last_attempt_at: cancellation.last_attempt_at || null,
      refunded_at: cancellation.refunded_at || null,
      completed_at: cancellation.completed_at || null,
      last_error: String(cancellation.last_error || '')
    },
    invoice: order?.invoice ? {
      status: String(order.invoice.status || ''),
      number: String(order.invoice.number || '')
    } : null,
    created_at: order?.created_at || null,
    updated_at: order?.updated_at || null
  };
}

function injectAdminExtraTabs(html) {
  if (html.includes('admin-extra-tabs.js')) return html;
  return html.replace('</body>', '<script src="admin-extra-tabs.js?v=1"></script>\n</body>');
}

function registerAvailabilityRequestRoutes(app, { userFromRequest } = {}) {
  app.get('/admin.html', (req, res, next) => {
    try {
      const html = injectAdminExtraTabs(fs.readFileSync(ADMIN_HTML, 'utf8'));
      res.type('html').send(html);
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/availability-requests', express.json({ limit: '32kb' }));
  app.use('/api/admin/availability-requests', express.json({ limit: '32kb' }));
  app.use('/data/availability-requests.json', (req, res) => res.status(404).end());

  app.get('/api/availability-requests/mine', (req, res) => {
    if (typeof userFromRequest !== 'function') {
      return res.status(503).json({ error: 'Consulta de confirmações temporariamente indisponível.' });
    }
    const user = userFromRequest(req);
    if (!user) {
      return res.status(401).json({
        error: 'Entre na sua conta para consultar suas confirmações.',
        code: 'authentication_required'
      });
    }
    const productId = Number(req.query?.product_id || 0);
    let items = customerPurchases(user);
    if (productId > 0) items = items.filter(item => Number(item.product_id) === productId);
    res.set('Cache-Control', 'no-store');
    return res.json({ items });
  });

  app.post('/api/availability-requests', async (req, res) => {
    if (typeof userFromRequest !== 'function') {
      return res.status(503).json({ error: 'Solicitação de disponibilidade temporariamente indisponível.' });
    }

    const user = userFromRequest(req);
    if (!user) {
      return res.status(401).json({
        error: 'Entre na sua conta para enviar a solicitação de disponibilidade.',
        code: 'authentication_required'
      });
    }

    const productId = Number(req.body?.product_id || 0);
    const products = read(PRODUCTS, []);
    const product = products.find(item => Number(item?.id) === productId && item?.ativo !== false);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });

    const availability = availabilityForProduct(product, readDetails());
    if (availability.type !== MEDIANTE_CONFIRMACAO) {
      return res.status(409).json({
        error: 'Este produto não está configurado como pedido mediante confirmação.',
        code: 'confirmation_not_required'
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const email = String(user.email || '').trim().toLowerCase();
    const requests = read(REQUESTS, []);
    const duplicateCutoff = now.getTime() - 24 * 60 * 60 * 1000;
    const duplicate = requests.find(item => {
      const sameCustomer = Number(item?.product?.id) === productId &&
        String(item?.customer?.email || '').trim().toLowerCase() === email;
      if (!sameCustomer) return false;
      if (purchaseState(item) === 'active') return true;
      return ['pending', 'contacted'].includes(String(item?.status || '')) &&
        new Date(item?.created_at || 0).getTime() >= duplicateCutoff;
    });

    if (duplicate) {
      return res.json({
        ok: true,
        duplicate: true,
        request: requestSnapshot(duplicate),
        message: purchaseState(duplicate) === 'active'
          ? 'Sua compra já foi liberada para esta conta.'
          : 'Sua solicitação já está registrada e a loja poderá acompanhar pelo painel.'
      });
    }

    const source = ['catalog', 'product_page'].includes(String(req.body?.source || ''))
      ? String(req.body.source)
      : 'site';
    const request = {
      id: `CONF-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      status: 'pending',
      product: {
        id: Number(product.id),
        nome: String(product.nome || '').trim().slice(0, 180),
        marca: String(product.marca || '').trim().slice(0, 100),
        sku: String(product.sku || '').trim().slice(0, 100),
        preco: Number(product.preco || 0)
      },
      customer: {
        user_id: String(user.id || ''),
        nome: String(user.nome || '').trim().slice(0, 160),
        email: email.slice(0, 180),
        telefone: phoneDigits(user)
      },
      source,
      admin_note: '',
      history: [{ status: 'pending', at: nowIso }],
      created_at: nowIso,
      updated_at: nowIso
    };

    requests.push(request);
    try {
      await persistRequests(requests);
    } catch (error) {
      console.error('Falha ao persistir solicitação de disponibilidade:', { productId, message: error.message });
      return res.status(500).json({ error: 'Não foi possível registrar a solicitação. Tente novamente.' });
    }

    console.log('Solicitação de disponibilidade registrada:', { request_id: request.id, product_id: productId, customer: email });
    return res.status(201).json({
      ok: true,
      request: requestSnapshot(request),
      message: 'Solicitação enviada para a Relógio e Cia.'
    });
  });

  app.get('/api/admin/availability-requests', admin, (req, res) => {
    const requests = read(REQUESTS, [])
      .slice()
      .sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0))
      .map(requestSnapshot);
    res.set('Cache-Control', 'no-store');
    res.json(requests);
  });

  app.post('/api/admin/availability-requests/:id/release-purchase', admin, async (req, res) => {
    try {
      const request = await releasePurchase(req.params.id, {
        hours: req.body?.hours,
        quantity: req.body?.quantity
      });
      return res.json({
        ok: true,
        request: requestSnapshot(request),
        message: 'Compra liberada somente para este cliente.'
      });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || 'Não foi possível liberar a compra.' });
    }
  });

  app.post('/api/admin/availability-requests/:id/revoke-purchase', admin, async (req, res) => {
    try {
      const request = await revokePurchase(req.params.id);
      return res.json({
        ok: true,
        request: requestSnapshot(request),
        message: 'Liberação de compra revogada.'
      });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || 'Não foi possível revogar a liberação.' });
    }
  });

  app.patch('/api/admin/availability-requests/:id', admin, async (req, res) => {
    const requests = read(REQUESTS, []);
    const index = requests.findIndex(item => String(item?.id || '') === String(req.params.id || ''));
    if (index < 0) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    let status;
    try { status = normalizeRequestStatus(req.body?.status || requests[index].status); }
    catch (error) { return res.status(error.status || 400).json({ error: error.message }); }

    const current = requests[index];
    const currentPurchaseState = purchaseState(current);
    if (status === 'confirmed_available' && currentPurchaseState !== 'active' && currentPurchaseState !== 'claimed') {
      return res.status(409).json({
        error: 'Use “Confirmar e liberar compra” para confirmar a disponibilidade e criar o acesso individual do cliente.'
      });
    }
    if (status !== 'confirmed_available' && currentPurchaseState === 'claimed') {
      return res.status(409).json({
        error: 'Este cliente já iniciou a compra. Aguarde o resultado do pagamento antes de alterar esta confirmação.'
      });
    }

    const note = cleanNote(req.body?.admin_note ?? current.admin_note);
    const now = new Date().toISOString();
    const changed = status !== current.status;
    let purchaseAuthorization = current.purchase_authorization;
    if (changed && status !== 'confirmed_available' && purchaseAuthorization && !purchaseAuthorization.completed_at) {
      purchaseAuthorization = {
        ...purchaseAuthorization,
        revoked_at: now,
        claimed_order_id: null,
        claimed_at: null
      };
    }
    requests[index] = {
      ...current,
      status,
      admin_note: note,
      purchase_authorization: purchaseAuthorization,
      history: changed
        ? [...(Array.isArray(current.history) ? current.history : []), { status, at: now }]
        : current.history,
      updated_at: now
    };

    try { await persistRequests(requests); }
    catch (error) { return res.status(500).json({ error: 'Não foi possível salvar a atualização.' }); }

    res.json({ ok: true, request: requestSnapshot(requests[index]) });
  });

  app.get('/api/admin/store-cancellations', admin, (req, res) => {
    const cancellations = read(ORDERS, [])
      .filter(order => order?.store_cancellation)
      .slice()
      .sort((a, b) => {
        const ca = a?.store_cancellation?.requested_at || a?.updated_at || a?.created_at || 0;
        const cb = b?.store_cancellation?.requested_at || b?.updated_at || b?.created_at || 0;
        return new Date(cb) - new Date(ca);
      })
      .map(storeCancellationSnapshot);
    res.set('Cache-Control', 'no-store');
    res.json(cancellations);
  });
}

module.exports = {
  REQUEST_STATUSES,
  normalizeRequestStatus,
  requestSnapshot,
  storeCancellationSnapshot,
  injectAdminExtraTabs,
  registerAvailabilityRequestRoutes
};
