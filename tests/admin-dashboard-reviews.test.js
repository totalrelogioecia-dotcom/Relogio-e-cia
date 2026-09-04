const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const { aggregate, orderContainsProduct, paidOrder } = require('../product-reviews');
const { actionFromRequest, targetFromPath } = require('../admin-audit');

test('novos módulos JavaScript têm sintaxe válida', () => {
  [
    'admin-audit.js',
    'admin-dashboard-data.js',
    'admin-dashboard.js',
    'product-reviews.js',
    'product-reviews-client.js'
  ].forEach(file => {
    execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
  });
});

test('avaliações públicas agregam somente itens aprovados', () => {
  const summary = aggregate([
    { rating: 5, status: 'approved' },
    { rating: 4, status: 'approved' },
    { rating: 1, status: 'pending' },
    { rating: 2, status: 'rejected' }
  ]);
  assert.equal(summary.count, 2);
  assert.equal(summary.average, 4.5);
  assert.equal(summary.distribution[5], 1);
  assert.equal(summary.distribution[4], 1);
  assert.equal(summary.distribution[1], 0);
});

test('compra verificada reconhece o formato atual dos itens de pedido', () => {
  const order = {
    status: 'paid',
    payment_status: 'approved',
    items: [{ id: 42, nome: 'Relógio teste', quantidade: 1, unit_price: 500 }]
  };
  assert.equal(paidOrder(order), true);
  assert.equal(orderContainsProduct(order, 42), true);
  assert.equal(orderContainsProduct(order, 99), false);
});

test('auditoria classifica ações administrativas sem depender do corpo da requisição', () => {
  assert.equal(actionFromRequest('PATCH', '/api/admin/orders/PED-123/invoice'), 'NF-e atualizada');
  assert.equal(actionFromRequest('PATCH', '/api/admin/orders/PED-123/fulfillment'), 'Envio atualizado');
  assert.equal(actionFromRequest('PATCH', '/api/admin/reviews/abc'), 'Avaliação moderada');
  assert.deepEqual(targetFromPath('/api/admin/products/77/permanent'), { entity: 'produto', entity_id: '77' });
  assert.doesNotMatch(read('admin-audit.js'), /req\?*\.body|req\.body/);
});

test('persistência inclui auditoria e avaliações sem alterar chaves existentes', () => {
  const store = read('persistent-store.js');
  assert.match(store, /'admin_audit'/);
  assert.match(store, /'product_reviews'/);
  assert.match(store, /'products'/);
  assert.match(store, /'orders'/);
});

test('bootstrap registra dashboard e avaliações antes das rotas de checkout', () => {
  const bootstrap = read('auth-bootstrap.js');
  const reviews = bootstrap.indexOf('registerReviewRoutes(app, { userFromRequest });');
  const dashboard = bootstrap.indexOf('registerAdminDashboardRoutes(app);');
  const checkout = bootstrap.indexOf("app.use('/api/checkout'");
  assert.ok(reviews >= 0 && dashboard > reviews && checkout > dashboard);
});

test('Admin expõe visão geral, avaliações e auditoria sem remover áreas existentes', () => {
  const html = read('admin.html');
  ['overview', 'pedidos', 'produtos', 'reviews', 'trocas', 'cupons', 'audit'].forEach(tab => {
    assert.match(html, new RegExp(`data-tab=["']${tab}["']`));
  });
  assert.match(html, /id=["']store-health-panel["']/);
  assert.match(html, /admin-dashboard\.js/);
  assert.match(html, /admin-dashboard\.css/);
});

test('página de produto carrega o módulo de avaliações verificadas', () => {
  const html = read('produto.html');
  const client = read('product-reviews-client.js');
  const backend = read('product-reviews.js');
  assert.match(html, /product-reviews\.css/);
  assert.match(html, /product-reviews-client\.js/);
  assert.match(client, /Compra verificada/);
  assert.match(backend, /Somente clientes que compraram este produto podem avaliá-lo/);
  assert.match(backend, /status:\s*'pending'/);
});

test('segurança registra auditoria após validar a sessão administrativa', () => {
  const security = read('admin-security-bootstrap.js');
  const validation = security.indexOf('if (!validToken(token))');
  const audit = security.indexOf('recordRequestAudit(req, res, token);');
  assert.ok(validation >= 0 && audit > validation);
  assert.match(security, /HttpOnly/);
  assert.match(security, /SameSite=Strict/);
});
