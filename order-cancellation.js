const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { flushPersistentStore } = require('./persistent-store');
const { queueOrderCancellationEmail } = require('./order-cancellation-email');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const ORDERS = path.join(DATA, 'orders.json');

const {
  CANCELLATION_REASONS,
  normalizeCancellationReason,
  isPaidOrder,
  refundTarget,
  customerOrder
} = require('./order-cancellation-policy');

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function write(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

async function persistOrders(orders) {
  write(ORDERS, orders);
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

function providerCode(data) {
  const candidates = [
    data?.code,
    data?.error,
    data?.message,
    data?.status_detail,
    data?.cause?.[0]?.code,
    data?.cause?.[0]?.description
  ].filter(value => value !== undefined && value !== null);
  return candidates.map(value => String(value)).join(' | ');
}

function alreadyRefunded(data) {
  const text = `${providerCode(data)} ${JSON.stringify(data || {})}`.toLowerCase();
  return text.includes('order_already_refunded')
    || text.includes('already refunded')
    || text.includes('already_refunded')
    || text.includes('charge-already-refunded')
    || /(^|\D)4296(\D|$)/.test(text);
}

function refundReference(target, data) {
  if (target?.kind === 'order') {
    return data?.transactions?.refunds?.[0]?.id || data?.transactions?.refunds?.[0]?.reference_id || null;
  }
  return data?.id ? String(data.id) : null;
}

async function requestFullRefund(order, idempotencyKey) {
  const accessToken = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!accessToken) {
    const error = new Error('Mercado Pago não está configurado para realizar o estorno.');
    error.status = 503;
    throw error;
  }

  const target = refundTarget(order);
  if (!target) {
    const error = new Error('Este pedido não possui identificador de pagamento suficiente para solicitar o estorno.');
    error.status = 409;
    throw error;
  }

  let response;
  try {
    response = await fetch(target.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Idempotency-Key': String(idempotencyKey)
      },
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    const wrapped = new Error(error?.name === 'TimeoutError'
      ? 'O Mercado Pago não respondeu a tempo. Tente novamente; a mesma chave de segurança será reutilizada.'
      : 'Não foi possível comunicar com o Mercado Pago para confirmar o estorno.');
    wrapped.status = 502;
    throw wrapped;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok && !alreadyRefunded(data)) {
    const detail = providerCode(data).slice(0, 300);
    const error = new Error(detail || `Mercado Pago respondeu HTTP ${response.status} ao solicitar o estorno.`);
    error.status = response.status >= 400 && response.status < 500 ? response.status : 502;
    error.provider_status = response.status;
    throw error;
  }

  return {
    target,
    data,
    already_refunded: !response.ok && alreadyRefunded(data),
    refund_reference: refundReference(target, data)
  };
}

function registerOrderCancellationRoutes(app, { userFromRequest } = {}) {
  app.use('/api/admin/orders', express.json({ limit: '64kb' }));

  app.post('/api/admin/orders/:id/cancel-by-store', admin, async (req, res) => {
    const orderId = String(req.params.id || '').trim();
    const orders = read(ORDERS, []);
    const index = orders.findIndex(order => String(order?.id || '') === orderId);
    if (index < 0) return res.status(404).json({ error: 'Pedido não encontrado.' });

    const order = orders[index];
    const existingCancellation = order.store_cancellation || null;
    if (existingCancellation?.status === 'refunded') {
      return res.json({ ok: true, already_refunded: true, order: customerOrder(order) });
    }

    if (!isPaidOrder(order)) {
      return res.status(409).json({
        error: 'O cancelamento com estorno só está disponível para pedidos com pagamento aprovado. Pedidos não pagos não precisam de estorno.'
      });
    }

    let reason;
    try {
      reason = existingCancellation?.requested_at
        ? {
            code: existingCancellation.reason_code,
            label: existingCancellation.reason_label,
            details: existingCancellation.details || ''
          }
        : normalizeCancellationReason(req.body?.reason_code, req.body?.details);
    } catch (error) {
      return res.status(error.status || 400).json({ error: error.message });
    }

    const target = refundTarget(order);
    if (!target) {
      return res.status(409).json({
        error: 'Não encontrei o identificador do pagamento no pedido. O pedido não foi cancelado nem alterado.'
      });
    }

    const now = new Date().toISOString();
    const idempotencyKey = existingCancellation?.idempotency_key || crypto.randomUUID();
    order.store_cancellation = {
      ...(existingCancellation || {}),
      status: 'refund_pending',
      reason_code: reason.code,
      reason_label: reason.label,
      details: reason.details,
      original_status: existingCancellation?.original_status || order.status || null,
      original_payment_status: existingCancellation?.original_payment_status || order.payment_status || null,
      idempotency_key: idempotencyKey,
      requested_at: existingCancellation?.requested_at || now,
      last_attempt_at: now,
      attempts: Number(existingCancellation?.attempts || 0) + 1,
      last_error: null,
      updated_at: now
    };
    orders[index] = order;

    try {
      await persistOrders(orders);
    } catch (error) {
      console.error('Falha ao registrar solicitação de cancelamento:', { orderId, message: error.message });
      return res.status(500).json({ error: 'Não foi possível registrar o cancelamento com segurança. Nenhum estorno foi solicitado.' });
    }

    let refund;
    try {
      refund = await requestFullRefund(order, idempotencyKey);
    } catch (error) {
      const currentOrders = read(ORDERS, []);
      const currentIndex = currentOrders.findIndex(item => String(item?.id || '') === orderId);
      if (currentIndex >= 0) {
        const failedAt = new Date().toISOString();
        currentOrders[currentIndex].store_cancellation = {
          ...(currentOrders[currentIndex].store_cancellation || order.store_cancellation),
          status: 'refund_failed',
          last_error: String(error.message || 'Falha no estorno.').slice(0, 500),
          last_error_at: failedAt,
          updated_at: failedAt
        };
        currentOrders[currentIndex].updated_at = failedAt;
        await persistOrders(currentOrders).catch(persistError => {
          console.error('Falha ao registrar erro do estorno:', { orderId, message: persistError.message });
        });
      }

      console.error('Estorno não confirmado; pedido permanece pago', { orderId, message: error.message });
      return res.status(error.status || 502).json({
        error: `O pedido NÃO foi marcado como cancelado porque o estorno não foi confirmado pelo Mercado Pago. ${error.message || 'Tente novamente.'}`,
        code: 'refund_not_confirmed'
      });
    }

    const currentOrders = read(ORDERS, []);
    const currentIndex = currentOrders.findIndex(item => String(item?.id || '') === orderId);
    if (currentIndex < 0) {
      console.error('Estorno confirmado, mas pedido não foi encontrado para registrar resultado', { orderId });
      return res.status(500).json({
        error: 'O Mercado Pago confirmou o estorno, mas o site não conseguiu localizar o pedido para salvar o status. Não solicite um novo estorno antes de conferir este pedido no Mercado Pago.',
        code: 'refund_confirmed_persist_failed'
      });
    }

    const current = currentOrders[currentIndex];
    const completedAt = new Date().toISOString();
    current.status = 'cancelled_by_store';
    current.payment_status = 'refunded';
    current.updated_at = completedAt;
    current.store_cancellation = {
      ...(current.store_cancellation || order.store_cancellation),
      status: 'refunded',
      provider: refund.target.kind === 'order' ? 'mercadopago_orders' : 'mercadopago_payments',
      provider_id: refund.target.id,
      provider_status: String(refund.data?.status || refund.data?.status_detail || (refund.already_refunded ? 'already_refunded' : 'refunded')),
      refund_reference: refund.refund_reference,
      already_refunded_at_provider: Boolean(refund.already_refunded),
      refunded_at: completedAt,
      completed_at: completedAt,
      updated_at: completedAt,
      last_error: null
    };
    currentOrders[currentIndex] = current;

    try {
      await persistOrders(currentOrders);
    } catch (error) {
      console.error('Estorno confirmado, mas falhou persistência final do cancelamento', { orderId, message: error.message });
      return res.status(500).json({
        error: 'O estorno foi confirmado pelo Mercado Pago, mas houve falha ao salvar o status final no site. Não tente estornar novamente antes de conferir o pedido.',
        code: 'refund_confirmed_persist_failed'
      });
    }

    console.log('Pedido cancelado pela loja com estorno confirmado', {
      orderId,
      payment_id: current.payment_id || null,
      mp_order_id: current.mp_order_id || null,
      refund_reference: current.store_cancellation.refund_reference || null
    });

    queueOrderCancellationEmail(orderId);
    return res.json({ ok: true, order: customerOrder(current) });
  });

  app.get('/api/auth/orders', (req, res) => {
    if (typeof userFromRequest !== 'function') {
      return res.status(503).json({ error: 'Consulta de pedidos indisponível.' });
    }
    const user = userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });

    const email = String(user.email || '').trim().toLowerCase();
    const orders = read(ORDERS, [])
      .filter(order => String(order?.payer?.email || '').trim().toLowerCase() === email)
      .sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0))
      .map(customerOrder);

    res.set('Cache-Control', 'no-store');
    res.json({ orders });
  });
}

module.exports = {
  CANCELLATION_REASONS,
  normalizeCancellationReason,
  isPaidOrder,
  refundTarget,
  customerOrder,
  registerOrderCancellationRoutes
};
