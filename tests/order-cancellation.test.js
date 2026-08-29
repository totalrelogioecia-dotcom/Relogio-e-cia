const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeCancellationReason,
  isPaidOrder,
  refundTarget,
  customerOrder
} = require('../order-cancellation-policy');

test('motivo de cancelamento pré-definido é normalizado', () => {
  assert.deepEqual(normalizeCancellationReason('product_unavailable', ''), {
    code: 'product_unavailable',
    label: 'Produto indisponível',
    details: ''
  });
});

test('outro motivo exige explicação', () => {
  assert.throws(
    () => normalizeCancellationReason('other', 'x'),
    error => error?.status === 400
  );
});

test('somente pagamento efetivamente aprovado é tratado como pago', () => {
  assert.equal(isPaidOrder({ status: 'paid', payment_status: 'approved' }), true);
  assert.equal(isPaidOrder({ status: 'pending', payment_status: 'pending' }), false);
  assert.equal(isPaidOrder({ status: 'rejected', payment_status: 'rejected' }), false);
});

test('PIX criado pela Orders API usa reembolso da order', () => {
  const target = refundTarget({ metodo: 'pix', mp_order_id: 'ORD123', payment_id: 'PAY123' });
  assert.equal(target.kind, 'order');
  assert.match(target.url, /\/v1\/orders\/ORD123\/refund$/);
});

test('cartão usa reembolso pelo payment_id', () => {
  const target = refundTarget({ metodo: 'cartao', payment_id: '123456789' });
  assert.equal(target.kind, 'payment');
  assert.match(target.url, /\/v1\/payments\/123456789\/refunds$/);
});

test('pedido sem identificador de pagamento não cria alvo de estorno', () => {
  assert.equal(refundTarget({ metodo: 'cartao' }), null);
});

test('resposta da conta não expõe dados internos do pagamento', () => {
  const result = customerOrder({
    id: 'PED-1',
    status: 'cancelled_by_store',
    payment_status: 'refunded',
    payment_id: 'SECRET-PAYMENT-ID',
    payer: { email: 'cliente@example.com' },
    total: 500,
    items: [{ nome: 'Relógio', quantidade: 1, unit_price: 500 }],
    store_cancellation: { status: 'refunded', reason_label: 'Produto indisponível' }
  });
  assert.equal(result.id, 'PED-1');
  assert.equal(result.cancellation.status, 'refunded');
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'payment_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'payer'), false);
});
