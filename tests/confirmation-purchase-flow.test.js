const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('módulos da confirmação individual têm sintaxe válida', () => {
  [
    'confirmation-purchase-service.js',
    'checkout-confirmation-context.js',
    'confirmation-payment-completion.js',
    'availability-requests.js',
    'product-availability-service.js',
    'auth-bootstrap.js',
    'inventory-service.js',
    'admin-extra-tabs.js',
    'catalog-availability.js',
    'cart-availability.js',
    'product-confirmation-request.js'
  ].forEach(file => {
    execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
  });
});

test('admin libera e revoga compra individual sem alterar disponibilidade global', () => {
  const routes = read('availability-requests.js');
  const service = read('confirmation-purchase-service.js');
  assert.match(routes, /\/api\/admin\/availability-requests\/:id\/release-purchase/);
  assert.match(routes, /\/api\/admin\/availability-requests\/:id\/revoke-purchase/);
  assert.match(routes, /\/api\/availability-requests\/mine/);
  assert.match(service, /DEFAULT_RELEASE_HOURS\s*=\s*48/);
  assert.match(service, /purchase_authorization/);
  assert.match(service, /customerMatches/);
  assert.doesNotMatch(service, /product-details\.json/);
});

test('checkout exige que a liberação pertença à conta autenticada', () => {
  const policy = read('product-availability-service.js');
  const auth = read('auth-bootstrap.js');
  assert.match(policy, /customerAuthorization/);
  assert.match(policy, /effectiveCustomer/);
  assert.match(auth, /claimPurchases/);
  assert.match(auth, /createCheckoutContext/);
  assert.match(auth, /runCheckoutContext/);
  assert.match(auth, /rebindClaims/);
});

test('interface distingue solicitação de compra já liberada', () => {
  const admin = read('admin-extra-tabs.js');
  const catalog = read('catalog-availability.js');
  const cart = read('cart-availability.js');
  const product = read('product-confirmation-request.js');
  assert.match(admin, /Confirmar e liberar compra/);
  assert.match(admin, /Copiar link/);
  assert.match(catalog, /Disponibilidade confirmada/);
  assert.match(cart, /compra liberada para sua conta/);
  assert.match(product, /confirmation-released/);
  assert.match(product, /Adicionar ao carrinho/);
});

test('pagamento aprovado encerra somente confirmação vinculada ao cliente e produto', () => {
  const completion = read('confirmation-payment-completion.js');
  const inventory = read('inventory-service.js');
  assert.match(completion, /mediante_confirmacao/);
  assert.match(completion, /customerEmail/);
  assert.match(completion, /productIds/);
  assert.match(completion, /claimed_order_id/);
  assert.match(completion, /status\s*=\s*'closed'/);
  assert.match(inventory, /completeConfirmationPurchases\(order\)/);
});
