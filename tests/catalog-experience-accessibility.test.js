const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('novos módulos têm sintaxe JavaScript válida', () => {
  [
    'accessibility-panel.js', 'catalog-intelligence.js', 'favorites.js', 'favorites-client.js',
    'admin-favorites.js', 'product-compare.js', 'product-recommendations.js', 'site-search.js',
    'auth-bootstrap.js', 'admin-security-bootstrap.js', 'public-static-policy.js'
  ].forEach(file => execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' }));
});

test('motor técnico interpreta preço, movimento, cor e resistência à água', () => {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(read('catalog-intelligence.js'), context);
  const engine = context.window.RelogioCatalogIntelligence;
  const parsed = engine.parseQuery('G-Shock preto automático até R$ 800 com 200m');
  assert.equal(parsed.filters.maxPrice, 800);
  assert.equal(parsed.filters.movement, 'automatico');
  assert.equal(parsed.filters.color, 'preto');
  assert.equal(parsed.filters.waterResistance, 200);
});

test('busca inteligente usa ficha técnica e motor compartilhado', () => {
  const search = read('site-search.js');
  assert.match(search, /catalog-intelligence\.js/);
  assert.match(search, /\/api\/product-details/);
  assert.match(search, /scoreProduct/);
  assert.match(search, /faixa de preço|características técnicas/);
});

test('comparador limita a 3 relógios e mostra miniaturas na seleção e busca', () => {
  const compare = read('product-compare.js');
  assert.match(compare, /produto\.html/);
  assert.match(compare, /selected\.length>=3/);
  assert.match(compare, /compare-suggestion-photo/);
  assert.match(compare, /compare-product-card/);
  assert.match(compare, /object-fit:contain/);
  assert.match(compare, /Movimento/);
  assert.match(compare, /Resistência à água/);
  assert.match(compare, /Garantia/);
});

test('favoritos exigem conta e são persistidos no registro do usuário', () => {
  const favorites = read('favorites.js');
  assert.match(favorites, /userFromRequest\(req\)/);
  assert.match(favorites, /users\[index\]\.favorites/);
  assert.match(favorites, /flushPersistentStore/);
  assert.match(favorites, /\/api\/admin\/favorites\/summary/);
  assert.doesNotMatch(favorites, /password_hash/);
});

test('favoritos aparecem no perfil, produto e cards do catálogo', () => {
  const client = read('favorites-client.js');
  const bootstrap = read('auth-bootstrap.js');
  assert.match(client, /account-favorites-section/);
  assert.match(client, /favorite-product-button/);
  assert.match(client, /catalog-favorite-button/);
  assert.match(client, /data-catalog-favorite/);
  assert.match(client, /MutationObserver/);
  assert.match(bootstrap, /page === 'produtos\.html'/);
  assert.match(bootstrap, /favorites-client\.js\?v=3/);
});

test('Admin mantém ranking de favoritos e ganha navegação em hub', () => {
  const admin = read('admin-favorites.js');
  assert.match(admin, /Mais favoritados/);
  assert.match(admin, /\/api\/admin\/favorites\/summary/);
  assert.match(admin, /Central administrativa/);
  assert.match(admin, /admin-hub-grid/);
  assert.match(admin, /Central administrativa/);
  assert.match(admin, /data-hub-tab/);
  assert.match(admin, /admin-back-hub/);
});

test('recomendações são técnicas e reutilizam o mesmo motor do catálogo', () => {
  const recommendations = read('product-recommendations.js');
  assert.match(recommendations, /RelogioCatalogIntelligence\.recommend/);
  assert.match(recommendations, /Recomendação técnica/);
  assert.match(recommendations, /reasons/);
});

test('painel avançado oferece múltiplos recursos de acessibilidade', () => {
  const panel = read('accessibility-panel.js');
  [
    'Alto contraste', 'Modo escuro', 'Tamanho do texto', 'Fonte de alta legibilidade',
    'Mais espaçamento', 'Sublinhar links', 'Reduzir animações', 'Foco reforçado',
    'Botões e campos maiores', 'Guia de leitura', 'Restaurar padrão'
  ].forEach(label => assert.match(panel, new RegExp(label)));
  assert.match(panel, /Alt\+A/);
  assert.match(panel, /Ir para o conteúdo principal/);
  assert.match(panel, /aria-live/);
});

test('acessibilidade usa um único A quadrado à direita do botão catálogo', () => {
  const panel = read('accessibility-panel.js');
  assert.match(panel, /position:static!important/);
  assert.match(panel, /border-radius:0/);
  assert.match(panel, /insertAdjacentElement\('afterend',b\)/);
  assert.match(panel, /\.nav-cta\{order:97\}/);
  assert.match(panel, /reloja-accessibility-global-rail/);
  assert.doesNotMatch(panel, /\.reloja-a11y-trigger\{position:fixed/);
});

test('somente scripts de navegador novos são públicos; backend de favoritos continua privado', () => {
  const policy = require('../public-static-policy');
  ['accessibility-panel.js','catalog-intelligence.js','favorites-client.js','admin-favorites.js','product-compare.js','product-recommendations.js'].forEach(file => assert.equal(policy.isPublicStaticPath('/' + file), true));
  assert.equal(policy.isPublicStaticPath('/favorites.js'), false);
  assert.equal(policy.isPublicStaticPath('/data/users.json'), false);
});

test('bootstrap não altera a ordem crítica do checkout do Mercado Pago', () => {
  const bootstrap = read('auth-bootstrap.js');
  const coupon = bootstrap.indexOf('registerCouponCheckout(app);');
  const pix = bootstrap.indexOf('registerMercadoPagoOrdersPix(app);');
  const card = bootstrap.indexOf('registerMercadoPagoClean(app);');
  assert.ok(coupon >= 0 && pix > coupon && card > pix);
  assert.match(bootstrap, /registerFavoriteRoutes\(app, \{ userFromRequest \}\)/);
  assert.match(bootstrap, /accessibility-panel\.js/);
});

test('Admin recebe hub e ranking agregado sem remover segurança de cookie', () => {
  const security = read('admin-security-bootstrap.js');
  assert.match(security, /admin-favorites\.js/);
  assert.match(security, /accessibility-panel\.js/);
  assert.match(security, /HttpOnly/);
  assert.match(security, /SameSite=Strict/);
});

test('catálogo mostra filtros ativos, prioriza pronta-entrega e usa links reais', () => {
  const html = read('produtos.html');
  const script = read('script.js');
  const filters = read('catalog-filters.css');
  const availability = read('catalog-availability.js');
  const technical = read('catalog-technical-filters.js');

  assert.match(html, /id="catalog-active-filters"/);
  assert.match(html, /value="pronta-entrega">Pronta-entrega primeiro/);
  assert.doesNotMatch(html, /catalog-product-links\.js/);
  assert.doesNotMatch(html, /id="modal-backdrop"/);

  assert.match(script, /class="card-photo-link"/);
  assert.match(script, /class="product-title-link"/);
  assert.match(script, /case 'pronta-entrega'/);
  assert.match(script, /renderActiveFilters/);
  assert.doesNotMatch(script, /function abrirModal/);

  assert.doesNotMatch(filters, /content-visibility\s*:/);
  assert.match(filters, /width:min\(86%, 360px\)/);
  assert.match(filters, /height:min\(86%, 320px\)/);
  assert.match(filters, /catalog-filter-chip/);
  assert.match(availability, /<strong>Pronta-entrega<\/strong>/);
  assert.match(technical, /data-reset-catalog-filters/);
});
