const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('páginas principais declaram viewport responsiva', () => {
  [
    'index.html', 'produtos.html', 'produto.html', 'carrinho.html', 'conta.html',
    'enderecos.html', 'trocas-estornos.html', 'pagamento.html', 'pagamento-pix.html', 'admin.html'
  ].forEach(file => {
    assert.match(read(file), /<meta[^>]+name=["']viewport["'][^>]+width=device-width/i, file);
  });
});

test('camada final de mobile é carregada globalmente sem alterar desktop', () => {
  const mobile = read('mobile-fixes.css');
  const review = read('mobile-complete-review.css');
  assert.match(mobile, /mobile-complete-review\.css\?v=1/);
  assert.match(review, /@media \(max-width: 640px\)/);
  assert.match(review, /@media \(max-width: 380px\)/);
  assert.doesNotMatch(review, /@media \(min-width/);
});

test('campos mobile usam 16px para evitar zoom automático e alvos principais chegam a 44px', () => {
  const css = read('mobile-complete-review.css');
  assert.match(css, /font-size:16px!important/);
  assert.match(css, /\.nav-toggle[\s\S]*min-height:44px!important/);
  assert.match(css, /\.reloja-a11y-trigger[\s\S]*min-height:44px!important/);
  assert.match(css, /\.catalog-favorite-button[\s\S]*min-height:44px!important/);
  assert.match(css, /\.qty-stepper button[\s\S]*height:44px!important/);
  assert.match(css, /\.catalog-filter-close[\s\S]*height:44px!important/);
});

test('busca inteligente ganha entrada própria no menu mobile', () => {
  execFileSync(process.execPath, ['--check', path.join(root, 'site-search.js')], { stdio: 'pipe' });
  const search = read('site-search.js');
  const css = read('mobile-complete-review.css');
  assert.match(search, /site-search-mobile-button/);
  assert.match(search, /nav-mobile-only site-search-mobile-item/);
  assert.match(search, /mobileButton\?\.addEventListener\('click', openSearch\)/);
  assert.match(search, /closeMobileMenu\(\)/);
  assert.match(css, /\.site-search-mobile-button/);
});

test('catálogo mobile empilha toolbar e mantém filtros utilizáveis por toque', () => {
  const css = read('mobile-complete-review.css');
  assert.match(css, /\.products-toolbar \.result-count[\s\S]*width:100%/);
  assert.match(css, /\.products-toolbar \.sort-control[\s\S]*width:100%/);
  assert.match(css, /\.filters \.check-row[\s\S]*min-height:44px/);
  assert.match(css, /\.filter-apply-button[\s\S]*min-height:44px!important/);
});

test('produto mobile remove colunas apertadas e preserva fotos sem corte', () => {
  const css = read('mobile-complete-review.css');
  assert.match(css, /\.product-main-photo[\s\S]*min-height:clamp\(280px,88vw,360px\)!important/);
  assert.match(css, /\.product-actions-main\.product-actions-enhanced[\s\S]*grid-template-columns:1fr!important/);
  assert.match(css, /\.spec-grid \.spec-item[\s\S]*grid-template-columns:1fr!important/);
  assert.match(css, /\.modal-photo img,[\s\S]*object-fit:contain!important/);
});

test('comparador mobile mantém comparação lateral com rolagem orientada', () => {
  const css = read('mobile-complete-review.css');
  assert.match(css, /Deslize para comparar os dados lado a lado/);
  assert.match(css, /\.compare-table[\s\S]*min-width:620px!important/);
  assert.match(css, /\.compare-criterion[\s\S]*position:sticky/);
  assert.match(css, /\.compare-photo[\s\S]*height:130px!important/);
});

test('carrinho e checkout mobile ampliam quantidade e mantêm opções legíveis', () => {
  const css = read('mobile-complete-review.css');
  assert.match(css, /\.qty-stepper button/);
  assert.match(css, /\.payment-option[\s\S]*min-height:58px/);
  assert.match(css, /\.shipping-form button[\s\S]*min-height:44px!important/);
  const cart = read('carrinho.html');
  assert.match(cart, /mercadopago-checkout-client\.js/);
  assert.match(cart, /mercadopago\.com\/v2\/security\.js/);
});

test('conta, endereços e admin ficam operáveis em telas estreitas', () => {
  const css = read('mobile-complete-review.css');
  assert.match(css, /\.account-box[\s\S]*max-width:100%/);
  assert.match(css, /\.account-favorites-grid[\s\S]*grid-template-columns:1fr!important/);
  assert.match(css, /\.address-card-actions button[\s\S]*min-height:44px/);
  assert.match(css, /\.admin-main[\s\S]*padding:28px 14px 56px!important/);
  assert.match(css, /\.admin-table-wrap[\s\S]*overflow-x:auto!important/);
  assert.match(css, /Deslize a tabela para o lado quando houver mais colunas/);
  assert.match(css, /\.admin-hub-grid[\s\S]*grid-template-columns:1fr!important/);
});

test('revisão mobile não altera ordem crítica do checkout Mercado Pago', () => {
  const bootstrap = read('auth-bootstrap.js');
  const coupon = bootstrap.indexOf('registerCouponCheckout(app);');
  const pix = bootstrap.indexOf('registerMercadoPagoOrdersPix(app);');
  const card = bootstrap.indexOf('registerMercadoPagoClean(app);');
  assert.ok(coupon >= 0 && pix > coupon && card > pix);
});
