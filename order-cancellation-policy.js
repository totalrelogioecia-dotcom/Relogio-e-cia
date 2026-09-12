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

function isRefundedOrder(order) {
  const status = String(order?.status || '').toLowerCase();
  const paymentStatus = String(order?.payment_status || '').toLowerCase();
  return status === 'refunded' || paymentStatus === 'refunded';
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

function receiptAddress(address) {
  if (!address || typeof address !== 'object') return null;
  return {
    zip_code: String(address.zip_code || '').replace(/\D/g, '').slice(0, 8),
    street_name: String(address.street_name || '').trim().slice(0, 120),
    street_number: String(address.street_number || '').trim().slice(0, 20),
    complement: String(address.complement || '').trim().slice(0, 120),
    neighborhood: String(address.neighborhood || '').trim().slice(0, 120),
    city_name: String(address.city_name || '').trim().slice(0, 120),
    state_code: String(address.state_code || address.state_name || '').trim().slice(0, 120)
  };
}

function receiptShipping(shipping) {
  if (!shipping || typeof shipping !== 'object') return null;
  const deliveryTime = Number(shipping.delivery_time);
  return {
    mode: String(shipping.mode || '').trim().slice(0, 40),
    service_name: String(shipping.service_name || '').trim().slice(0, 120),
    company_name: String(shipping.company_name || '').trim().slice(0, 120),
    price: Number(shipping.price || 0),
    original_price: Number.isFinite(Number(shipping.original_price)) ? Number(shipping.original_price) : null,
    delivery_time: Number.isFinite(deliveryTime) && deliveryTime >= 0 ? deliveryTime : null
  };
}

function receiptCoupon(coupon) {
  if (!coupon || typeof coupon !== 'object') return null;
  return {
    code: String(coupon.code || '').trim().slice(0, 80),
    type: String(coupon.type || '').trim().slice(0, 80),
    discount: Number(coupon.discount || 0)
  };
}

function customerOrder(order) {
  const cancellation = order?.store_cancellation || null;
  const shipping = receiptShipping(order?.shipping);
  const items = Array.isArray(order?.items) ? order.items.map(item => ({
    nome: String(item?.nome || 'Produto'),
    sku: String(item?.sku || '').trim().slice(0, 100),
    quantidade: Math.max(1, Number(item?.quantidade || 1)),
    unit_price: Number(item?.unit_price || 0)
  })) : [];
  const itemSubtotal = items.reduce((sum, item) => sum + item.quantidade * item.unit_price, 0);
  const storedSubtotal = Number(order?.subtotal);
  const subtotal = Number.isFinite(storedSubtotal) && storedSubtotal >= 0 ? storedSubtotal : itemSubtotal;
  return {
    id: String(order?.id || ''),
    status: String(order?.status || ''),
    payment_status: String(order?.payment_status || ''),
    stock_conflict: Boolean(order?.stock_conflict),
    metodo: String(order?.metodo || ''),
    subtotal,
    desconto_pix: Number(order?.desconto_pix || 0),
    coupon: receiptCoupon(order?.coupon),
    shipping,
    delivery_address: String(shipping?.mode || '').toLowerCase() === 'pickup'
      ? null
      : receiptAddress(order?.payer?.endereco),
    total: Number(order?.total || 0),
    created_at: order?.created_at || null,
    updated_at: order?.updated_at || null,
    items,
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
  isRefundedOrder,
  refundTarget,
  customerOrder
};
