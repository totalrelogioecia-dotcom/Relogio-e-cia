const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('novos módulos de performance e interface têm sintaxe válida', () => {
  [
    'product-page-route.js',
    'product-page-core.js',
    'accessibility-panel.js',
    'produto.js',
    'favorites-client.js',
    'product-compare.js',
    'product-recommendations.js',
    'admin-melhorenvio.js',
    'admin-favorites.js',
    'auth-bootstrap.js',
    'public-static-policy.js'
  ].forEach(file => execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' }));
});

test('página de produto usa endpoint leve em vez de aguardar catálogo completo', () => {
  const page = read('produto.html');
  const script = read('produto.js');
  assert.match(page, /product-page-core\.js/);
  assert.doesNotMatch(page, /<script src="script\.js"><\/script>/);
  assert.match(page, /product-loading-skeleton/);
  assert.match(script, /\/api\/product-page\//);
  assert.doesNotMatch(script, /quandoCatalogoPronto/);
  assert.doesNotMatch(script, /\/api\/product-details/);
});

test('rota leve entrega um produto e relacionados sem expor arquivos privados', () => {
  const route = read('product-page-route.js');
  assert.match(route, /\/api\/product-page\/:id/);
  assert.match(route, /details\[String\(id\)\]/);
  assert.match(route, /publicRelated/);
  assert.doesNotMatch(route, /res\.sendFile/);
});

test('ações da página de produto usam grade equilibrada', () => {
  const css = read('product-ui-polish.css');
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /min-height:58px/);
  assert.match(css, /@media\(max-width:620px\).*grid-template-columns:1fr/s);
});

test('favoritos reforçam coração no canto dos cards e observam redesenhos', () => {
  const client = read('favorites-client.js');
  assert.match(client, /catalog-favorite-button/);
  assert.match(client, /top:10px/);
  assert.match(client, /right:10px/);
  assert.match(client, /MutationObserver/);
  assert.match(client, /data-add-carrinho/);
  assert.match(client, /setInterval/);
});

test('comparador carrega catálogo somente ao abrir e mantém fotos contidas', () => {
  const compare = read('product-compare.js');
  assert.match(compare, /button\.onclick=async/);
  assert.match(compare, /await loadData\(\)/);
  assert.match(compare, /max-height:100%!important/);
  assert.match(compare, /width:auto!important/);
  assert.match(compare, /compare-suggestion-photo/);
});

test('recomendações técnicas são adiadas até perto da seção', () => {
  const recommendations = read('product-recommendations.js');
  assert.match(recommendations, /IntersectionObserver/);
  assert.match(recommendations, /rootMargin:'700px 0px'/);
});

test('acessibilidade usa símbolo visual, nome acessível e fica agrupada ao catálogo', () => {
  const enhancement = read('accessibility-panel.js');
  assert.match(enhancement, /<svg class="reloja-a11y-symbol"/);
  assert.match(enhancement, /aria-label','Abrir painel de acessibilidade/);
  assert.match(enhancement, /nav-actions-cluster/);
  assert.match(enhancement, /cluster\.appendChild\(catalog\)/);
  assert.match(enhancement, /cluster\.appendChild\(b\)/);
});

test('Melhor Envio fica recolhido em integrações quando conectado', () => {
  const admin = read('admin-melhorenvio.js');
  assert.match(admin, /admin-integrations-details/);
  assert.match(admin, /Integrações e serviços/);
  assert.match(admin, /overview\.appendChild\(wrapper\)/);
  assert.match(admin, /wrapper\.open = false/);
  assert.match(admin, /manutenção do token ocorre automaticamente/);
});

test('política pública libera apenas scripts de navegador novos', () => {
  const policy = require('../public-static-policy');
  assert.equal(policy.isPublicStaticPath('/product-page-core.js'), true);
  assert.equal(policy.isPublicStaticPath('/accessibility-panel.js'), true);
  assert.equal(policy.isPublicStaticPath('/accessibility-trigger-enhancement.js'), false);
  assert.equal(policy.isPublicStaticPath('/product-page-route.js'), false);
  assert.equal(policy.isPublicStaticPath('/data/products.json'), false);
});

test('bootstrap registra rota leve sem alterar ordem crítica de checkout', () => {
  const bootstrap = read('auth-bootstrap.js');
  assert.match(bootstrap, /registerProductPageRoute\(app\)/);
  assert.match(bootstrap, /favorites-client\.js\?v=3/);
  assert.match(bootstrap, /product-compare\.js\?v=3/);
  const coupon = bootstrap.indexOf('registerCouponCheckout(app);');
  const pix = bootstrap.indexOf('registerMercadoPagoOrdersPix(app);');
  const card = bootstrap.indexOf('registerMercadoPagoClean(app);');
  assert.ok(coupon >= 0 && pix > coupon && card > pix);
});
