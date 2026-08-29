const CANCELLATION_REASONS = Object.freeze({
  product_unavailable: 'Produto indisponível',
  supplier_unavailable: 'Fornecedor não conseguiu atender',
  stock_error: 'Problema de estoque',
  delivery_impossible: 'Impossibilidade de entrega',
  operational_issue: 'Imprevisto operacional da loja',
  other: 'Outro motivo'
});

function normalizeCancellationReason(code, details = '') {
  const normalizedCode = String(code || '').trim().toLowerCase();
  const label = CANCELLATION_REASONS[normalizedCode];
  if (!label) {
    const error = new Error('Selecione um motivo válido para o cancelamento.');
    error.status = 400;
    throw error;
  }

  const cleanDetails = String(details || '').trim().replace(/\s+/g, ' ').slice(0, 500);
  if (normalizedCode === 'other' && cleanDetails.length < 5) {
    const error = new Error('Explique o motivo do cancelamento quando selecionar “Outro motivo”.');
    error.status = 400;
    throw error;
  }

  return { code: normalizedCode, label, details: cleanDetails };
}

function isPaidOrder(order) {
  const status = String(order?.status || '').toLowerCase();
  const paymentStatus = String(order?.payment_status || '').toLowerCase();
  return status === 'paid' || paymentStatus === 'approved' || paymentStatus === 'processed';
}

function refundTarget(order) {
  const method = String(order?.metodo || '').trim().toLowerCase();
  const mpOrderId = String(order?.mp_order_id || '').trim();
  const paymentId = String(order?.payment_id || '').trim();

  if (method === 'pix' && mpOrderId) {
    return {
      kind: 'order',
      id: mpOrderId,
      url: `https://api.mercadopago.com/v1/orders/${encodeURIComponent(mpOrderId)}/refund`
    };
  }

  if (paymentId) {
    return {
      kind: 'payment',
      id: paymentId,
      url: `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}/refunds`
    };
  }

  return null;
}

function customerOrder(order) {
  const cancellation = order?.store_cancellation || null;
  return {
    id: String(order?.id || ''),
    status: String(order?.status || ''),
    payment_status: String(order?.payment_status || ''),
    metodo: String(order?.metodo || ''),
    total: Number(order?.total || 0),
    created_at: order?.created_at || null,
    updated_at: order?.updated_at || null,
    items: Array.isArray(order?.items) ? order.items.map(item => ({
      nome: String(item?.nome || 'Produto'),
      quantidade: Math.max(1, Number(item?.quantidade || 1)),
      unit_price: Number(item?.unit_price || 0)
    })) : [],
    cancellation: cancellation ? {
      status: String(cancellation.status || ''),
      reason_code: String(cancellation.reason_code || ''),
      reason_label: String(cancellation.reason_label || ''),
      details: String(cancellation.details || ''),
      requested_at: cancellation.requested_at || null,
      refunded_at: cancellation.refunded_at || null,
      completed_at: cancellation.completed_at || null
    } : null
  };
}

module.exports = {
  CANCELLATION_REASONS,
  normalizeCancellationReason,
  isPaidOrder,
  refundTarget,
  customerOrder
};
