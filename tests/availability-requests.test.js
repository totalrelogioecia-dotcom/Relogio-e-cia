const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeRequestStatus,
  requestSnapshot,
  storeCancellationSnapshot,
  injectAdminExtraTabs
} = require('../availability-requests');

test('aceita somente os status administrativos previstos', () => {
  assert.equal(normalizeRequestStatus('pending'), 'pending');
  assert.equal(normalizeRequestStatus('confirmed_available'), 'confirmed_available');
  assert.throws(() => normalizeRequestStatus('qualquer_coisa'), /Status da solicitação inválido/);
});

test('snapshot da confirmação não expõe user_id interno', () => {
  const snapshot = requestSnapshot({
    id: 'CONF-1', status: 'pending',
    product: { id: 7, nome: 'Relógio', marca: 'Casio', sku: 'ABC', preco: 499 },
    customer: { user_id: 'segredo-interno', nome: 'Cliente', email: 'cliente@example.com', telefone: '51999999999' },
    source: 'catalog', created_at: '2026-08-29T00:00:00.000Z'
  });
  assert.equal(snapshot.customer.email, 'cliente@example.com');
  assert.equal(Object.hasOwn(snapshot.customer, 'user_id'), false);
});

test('histórico de cancelamento entrega somente os dados necessários ao admin', () => {
  const snapshot = storeCancellationSnapshot({
    id: 'PED-1', total: 800, status: 'cancelled_by_store', payment_status: 'refunded',
    payer: { nome: 'Cliente', email: 'cliente@example.com', identificacao: { number: '00000000000' } },
    payment_id: 'nao-expor',
    store_cancellation: { status: 'refunded', reason_label: 'Produto indisponível', refunded_at: '2026-08-29T01:00:00.000Z' }
  });
  assert.equal(snapshot.order_id, 'PED-1');
  assert.equal(snapshot.cancellation.status, 'refunded');
  assert.equal(Object.hasOwn(snapshot, 'payment_id'), false);
  assert.equal(Object.hasOwn(snapshot.customer, 'identificacao'), false);
});

test('injeção do módulo administrativo é idempotente', () => {
  const html = '<html><body><script src="admin.js"></script></body></html>';
  const once = injectAdminExtraTabs(html);
  const twice = injectAdminExtraTabs(once);
  assert.match(once, /admin-extra-tabs\.js/);
  assert.equal(once, twice);
});
