const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('pedido público exige que o e-mail do pedido pertença à sessão', () => {
  const { orderBelongsToUser } = require('../order-access');
  assert.equal(orderBelongsToUser({ payer: { email: 'Cliente@Example.com' } }, { email: 'cliente@example.com' }), true);
  assert.equal(orderBelongsToUser({ payer: { email: 'cliente@example.com' } }, { email: 'outra@example.com' }), false);
  assert.equal(orderBelongsToUser({ payer: {} }, { email: 'cliente@example.com' }), false);

  for (const file of ['mercadopago-clean.js', 'mercadopago-orders-pix.js']) {
    const source = read(file);
    assert.match(source, /customerCanAccessOrder\(req, order\)/);
    assert.match(source, /\/api\/admin\/order\/:id\/sync/);
  }
});

test('webhook da Orders API valida assinatura e aplica o pedido', () => {
  const source = read('mercadopago-orders-pix.js');
  assert.match(source, /WebhookSignatureValidator\.validate\(\{/);
  assert.match(source, /await applyOrder\(await fetchOrder\(orderId\)\)/);
  assert.doesNotMatch(source, /evento order reconhecido e ignorado/);
});

test('cupom reserva limite no checkout e só vira uso aprovado após pagamento', () => {
  const service = read('coupon-service.js');
  const checkout = read('coupon-checkout.js');
  const payment = read('mercadopago-clean.js');

  assert.match(service, /status='approved' OR \(status='reserved' AND expires_at > NOW\(\)\)/);
  assert.match(service, /SELECT \* FROM relogio_coupons WHERE id=\$1 FOR UPDATE/);
  assert.match(service, /getDatabasePool/);
  assert.doesNotMatch(service, /new Pool\(/);
  assert.doesNotMatch(service, /rejectUnauthorized:\s*false/);
  assert.doesNotMatch(read('persistent-store.js'), /CREATE TABLE|ALTER TABLE|CREATE INDEX/i);
  assert.match(checkout, /await reserveCoupon\(\{/);
  assert.doesNotMatch(checkout, /await consumeCoupon\([^)]+\);\s*\n\s*\n\s*console\.log\('Checkout Pro/);
  assert.match(payment, /payment\?\.status === 'approved'[\s\S]+await consumeCoupon/);
});

test('baixa de estoque é atômica e sinaliza conflito sem saldo parcial', () => {
  const { applyPaidOrderStock } = require('../inventory-service');
  const products = [
    { id: 1, estoque: 2 },
    { id: 2, estoque: 1 }
  ];
  const conflict = applyPaidOrderStock(products, [
    { id: 1, quantidade: 1, disponibilidade: 'pronta_entrega' },
    { id: 2, quantidade: 2, disponibilidade: 'pronta_entrega' }
  ]);
  assert.equal(conflict.applied, false);
  assert.deepEqual(conflict.products, products);
  assert.equal(conflict.conflicts[0].product_id, 2);

  const applied = applyPaidOrderStock(products, [
    { id: 1, quantidade: 1, disponibilidade: 'pronta_entrega' },
    { id: 2, quantidade: 1, disponibilidade: 'pronta_entrega' }
  ]);
  assert.equal(applied.applied, true);
  assert.deepEqual(applied.products.map(item => item.estoque), [1, 0]);
  assert.deepEqual(products.map(item => item.estoque), [2, 1]);
});

test('sessão do cliente fica em cookie HttpOnly, sem bearer no localStorage', () => {
  const auth = read('auth.js');
  const account = read('conta.js');
  const legacyClient = read('script.js');
  assert.match(auth, /'HttpOnly'/);
  assert.match(auth, /'SameSite=Lax'/);
  assert.match(auth, /session_version/);
  assert.doesNotMatch(auth, /json\(\{ token,/);
  assert.match(account, /localStorage\.removeItem\(LEGACY_USERS_KEY\)/);
  assert.doesNotMatch(legacyClient, /reloja_usuarios|cadastrarUsuario|autenticarUsuario/);

  for (const file of [
    'account-orders.js',
    'catalog-availability.js',
    'customer-addresses.js',
    'enderecos.js',
    'favorites-client.js',
    'mercadopago-checkout-client.js',
    'product-confirmation-request.js',
    'shipping-addresses.js'
  ]) {
    assert.doesNotMatch(read(file), /reloja_auth_token/);
  }
});

test('saídas dinâmicas identificadas escapam HTML antes de usar innerHTML', () => {
  const catalog = read('script.js');
  const returns = read('return-request-form.js');
  const cart = read('carrinho.html');
  assert.match(catalog, /escaparHtmlSeguro\(p\.nome\)/);
  assert.match(catalog, /urlImagemSegura/);
  assert.match(catalog, /escaparHtmlSeguro\(i\.nome\)/);
  assert.match(returns, /esc\(request\.admin_note\)/);
  assert.match(returns, /esc\(item\.name\)/);
  assert.match(cart, /escaparHtmlCarrinho\(a\.nome\)/);
});

test('proxies validam redirecionamentos, tipo e tamanho, e enriquecimento é administrativo', () => {
  const proxy = read('remote-image.js');
  const pageProxy = read('image-proxy.js');
  assert.match(proxy, /redirect: 'manual'/);
  assert.match(proxy, /total > maxBytes/);
  assert.doesNotMatch(proxy, /image\/svg\+xml/);
  assert.match(pageProxy, /fetchAllowedText/);
  assert.match(pageProxy, /catalogHasSku\(sku\)/);
  assert.match(pageProxy, /\/api\/admin\/product-enrichment/);
  assert.match(read('orient-enrichment.js'), /\/api\/admin\/orient-enrichment/);
  assert.match(read('server.js'), /\/api\/admin\/casio-enrichment/);
});

test('produção usa Node 24, lockfile e instalação reproduzível', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.engines.node, '>=24 <25');
  assert.equal(packageJson.overrides.qs, '6.16.0');
  assert.ok(fs.existsSync(path.join(root, 'package-lock.json')));
  assert.match(read('render.yaml'), /npm ci --omit=dev --ignore-scripts/);
  assert.match(read('Dockerfile'), /FROM node:24-alpine/);
  assert.match(read('.github/workflows/mercadopago-clean-check.yml'), /node-version: '24'/);
});

test('Supabase é preferido sem remover o fallback e aparece no diagnóstico', () => {
  const persistence = read('persistent-store.js');
  assert.match(read('.env.example'), /SUPABASE_DATABASE_URL=/);
  assert.match(persistence, /process\.env\.SUPABASE_DATABASE_URL/);
  assert.match(persistence, /provider: 'supabase'/);
  assert.match(persistence, /provider: 'render-postgresql'/);
  assert.match(persistence, /provider: pool && ready \? activeProvider : 'local-files'/);
});
