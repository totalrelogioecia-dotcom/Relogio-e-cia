const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const {
  isApplicationRoute,
  isPublicStaticPath
} = require('../public-static-policy');

test('arquivos de dados, backend e configuração não são públicos', () => {
  const privatePaths = [
    '/data/products.json',
    '/data/orders.json',
    '/data/melhorenvio-auth.json',
    '/server.js',
    '/persistent-store.js',
    '/coupon-service.js',
    '/package.json',
    '/render.yaml',
    '/README.md',
    '/Dockerfile',
    '/.env.example',
    '/assets/%2e%2e/server.js'
  ];
  privatePaths.forEach(value => assert.equal(isPublicStaticPath(value), false, value));
});

test('páginas e recursos usados pelo navegador continuam públicos', () => {
  const htmlFiles = fs.readdirSync(root).filter(file => file.endsWith('.html'));
  for (const file of htmlFiles) {
    assert.equal(isPublicStaticPath(`/${file}`), true, file);
    const html = read(file);
    for (const match of html.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)) {
      const reference = match[1].split('?')[0];
      if (/^(?:[a-z]+:|\/\/)/i.test(reference)) continue;
      if (!/\.(?:js|css|svg|png|jpe?g|webp|gif|avif|ico|html)$/i.test(reference)) continue;
      assert.equal(isPublicStaticPath(`/${reference}`), true, `${file} -> ${reference}`);
    }
  }
  assert.equal(isApplicationRoute('/api/products'), true);
  assert.equal(isApplicationRoute('/healthz'), true);
});

test('servidor aplica a proteção antes do express.static', () => {
  const source = read('server.js');
  const guard = source.indexOf('app.use(createPublicStaticGuard());');
  const staticRoot = source.indexOf('app.use(express.static(ROOT');
  assert.ok(guard >= 0 && staticRoot > guard);
});

test('arquivos estáticos reutilizáveis recebem cache curto com revalidação', () => {
  const source = read('server.js');
  assert.match(source, /stale-while-revalidate=86400/);
  assert.match(source, /css\|js\|svg/);
});

test('cabeçalhos bloqueiam incorporação, objetos e alteração da base', () => {
  const source = read('auth-bootstrap.js');
  assert.match(source, /Content-Security-Policy/);
  assert.match(source, /base-uri 'self'/);
  assert.match(source, /frame-ancestors 'self'/);
  assert.match(source, /object-src 'none'/);
});

test('checkout com cupom usa as mesmas regras de disponibilidade e retirada', () => {
  const source = read('coupon-checkout.js');
  assert.match(source, /validateCheckoutAvailability\(product, quantidade, detailsMap\)/);
  assert.match(source, /disponibilidade:\s*availability\.type/);
  assert.match(source, /assertPickupAllowed\(payer\)/);
  assert.match(source, /if \(!isConfigured\(\)\) \{/);
  assert.match(source, /A entrega ainda não está disponível/);

  const pickup = source.indexOf("if (serviceId === 'pickup')");
  const provider = source.indexOf('if (!isConfigured())');
  assert.ok(pickup >= 0 && provider > pickup, 'retirada deve funcionar sem consultar o Melhor Envio');
});

test('cupom e busca inteligente são carregados pelas páginas corretas', () => {
  const cart = read('carrinho.html');
  assert.match(cart, /href="cart-coupons\.css(?:\?[^\"]+)?"/);
  assert.match(cart, /src="cart-coupons\.js(?:\?[^\"]+)?"/);
  assert.ok(
    cart.indexOf('cart-coupons.js') < cart.indexOf('mercadopago-checkout-client.js?v=pickup-5'),
    'cupom deve preparar o checkout antes do cliente Mercado Pago'
  );

  const admin = read('admin.html');
  assert.match(admin, /href="admin-product-enrichment\.css"/);
  assert.match(admin, /src="admin-product-enrichment\.js"/);

  const bootstrap = read('auth-bootstrap.js');
  assert.match(bootstrap, /mercadopago-checkout-client\\\.js\(\?:\\\?\[\^"'\]\*\)\?/);
});

