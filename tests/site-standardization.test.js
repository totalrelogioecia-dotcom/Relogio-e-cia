'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const { isPublicStaticPath } = require('../public-static-policy');

function catalogHarness(fetch) {
  const source = read('script.js').split('/* ---------- Carregamento do catálogo pelo backend ---------- */')[1].split('/* ---------- Lógica da página de produtos ---------- */')[0];
  const hosts = new Map(['product-grid', 'home-selection-grid'].map(id => [id, {}]));
  const errors = [];
  const context = vm.createContext({ PRODUTOS: [{ id: 'produto-antigo' }], fetch, console: { error() {} }, document: { querySelector: () => null, getElementById: id => hosts.get(id) || null }, window: { RelogioUI: { loading() {}, ready() {}, error(host, message, retry) { errors.push({ host, message, retry }); } } } });
  vm.runInContext(source, context);
  return { context, errors, run: code => vm.runInContext(code, context) };
}

test('catálogo oficial vazio não recupera produtos antigos embutidos', async () => {
  const app = catalogHarness(async () => ({ ok: true, json: async () => [] }));
  await app.run('quandoCatalogoPronto(() => { resultado = PRODUTOS; })');
  assert.equal(app.context.resultado.length, 0);
});

test('catálogo progressivo preserva o total encontrado e filtra dados antes dos lotes', () => {
  const script = read('script.js');
  const technical = read('catalog-technical-filters.js');
  const progressive = read('catalog-progressive.js');

  assert.match(script, /let resultado = PRODUTOS\.filter/);
  assert.match(script, /okMarca && okCategoria && okPreco && okTecnico/);
  assert.match(script, /grid\.dataset\.catalogTotal = String\(lista\.length\)/);
  assert.match(script, /RelogioCatalogTechnical\.matches\(p, technical\)/);
  assert.match(technical, /matches:\s*matchesTechnical/);
  assert.match(progressive, /totalProducts = cards\.length/);
  assert.match(progressive, /pendingCards = cards\.slice\(BATCH_SIZE\)/);
});

test('falha do catálogo mostra erro e não executa renderização com dados antigos', async () => {
  const app = catalogHarness(async () => { throw Error('offline'); });
  await app.run('quandoCatalogoPronto(() => { renderizado = true; })');
  assert.equal(app.context.renderizado, undefined);
  assert.equal(app.context.PRODUTOS.length, 0);
  assert.ok(app.errors.length > 0);
  assert.equal(typeof app.errors[0].retry, 'function');
});

test('tentar novamente compartilha uma consulta e recupera os módulos registrados', async () => {
  let calls = 0;
  const app = catalogHarness(async () => { calls++; return { ok: calls > 1, status: 503, json: async () => [{ id: 1 }] }; });
  await app.run('Promise.all([quandoCatalogoPronto(() => { primeiro = (typeof primeiro === "undefined" ? 0 : primeiro) + 1; }), quandoCatalogoPronto(() => { segundo = (typeof segundo === "undefined" ? 0 : segundo) + 1; })])');
  assert.equal(calls, 1);
  app.errors[0].retry();
  await app.run('catalogoCarregamento');
  await Promise.resolve();
  assert.equal(calls, 2);
  assert.equal(app.context.primeiro, 1);
  assert.equal(app.context.segundo, 1);
});

function adminHarness(fetch) {
  const elements = new Map();
  const element = selector => { if (!elements.has(selector)) elements.set(selector, { value: '', textContent: 'Entrar', style: {}, disabled: false, attrs: {}, setAttribute(key, value) { this.attrs[key] = value; }, removeAttribute(key) { delete this.attrs[key]; }, replaceChildren() {}, focus() {} }); return elements.get(selector); };
  element('#admin-email').value = 'support@example.com';
  element('#admin-senha').value = 'exemplo-teste';
  element('#dashboard').style.display = 'none';
  const storage = new Map();
  let loads = 0;
  const notices = [];
  const context = vm.createContext({ fetch, $: element, tokenKey: 'reloja_admin_token', localStorage: { setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k), getItem: k => storage.get(k) }, loadProducts() { loads++; }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }, window: { dispatchEvent() {}, addEventListener() {}, RelogioUI: { notice: async message => notices.push(message) } }, document: { getElementById: id => element('#' + id), querySelectorAll: () => [], addEventListener() {} } });
  const source = read('admin.js').split('let loginPending=false;')[1].split('function resetPhotos()')[0];
  vm.runInContext('let loginPending=false;' + source, context);
  return { context, storage, element, notices, get loads() { return loads; }, run: code => vm.runInContext(code, context) };
}

test('login administrativo impede envio duplicado e respeita o acesso Atendimento', async () => {
  let resolveResponse;
  let calls = 0;
  const app = adminHarness(() => { calls++; return new Promise(resolve => { resolveResponse = resolve; }); });
  const first = app.run('login()');
  await app.run('login()');
  assert.equal(calls, 1);
  assert.equal(app.element('#login-btn').disabled, true);
  resolveResponse({ ok: true, json: async () => ({ admin: { id: 'support', access_level: 'atendimento' } }) });
  await first;
  assert.equal(app.loads, 0);
  assert.equal(app.element('#dashboard').style.display, 'block');
  assert.equal(app.element('#admin-senha').value, '');
  assert.equal(app.element('#login-btn').disabled, false);
  assert.equal(app.storage.get('reloja_admin_token'), 'cookie-session');
});

test('falha ao sair não finge revogar o cookie e permite tentar novamente', async () => {
  let ok = false;
  const app = adminHarness(async () => ({ ok }));
  app.run('applyAdminSession({ id: "support", access_level: "atendimento" })');
  app.run(read('admin-secure-client.js'));
  await app.context.window.RelogioAdminClient.logout();
  assert.equal(app.element('#dashboard').style.display, 'block');
  assert.equal(app.storage.get('reloja_admin_token'), 'cookie-session');
  assert.equal(app.notices.length, 1);
  ok = true;
  await app.context.window.RelogioAdminClient.logout();
  assert.equal(app.element('#dashboard').style.display, 'none');
  assert.equal(app.storage.has('reloja_admin_token'), false);
});

test('sessão consultada antes do login não sobrescreve uma autenticação mais recente', async () => {
  let resolveResponse;
  const app = adminHarness(() => new Promise(resolve => { resolveResponse = resolve; }));
  const source = read('admin.js').split('async function restoreDash(){')[1].split('window.RelogioAdminClient.syncSession')[0];
  app.run('async function restoreDash(){' + source);
  const pending = app.run('restoreDash()');
  app.run('applyAdminSession({ id: "support", access_level: "atendimento" })');
  resolveResponse({ ok: true, json: async () => ({ authenticated: false }) });
  await pending;
  assert.equal(app.element('#dashboard').style.display, 'block');
});

test('todas as páginas usam uma única base comum de estados e modais', () => {
  for (const name of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
    const html = read(name);
    for (const script of ['site-dialog.js', 'site-ui.js', 'modal-accessibility.js']) {
      assert.equal((html.match(new RegExp('src="' + script.replace('.', '\\.') + '(?:\\?[^" ]*)?"', 'g')) || []).length, 1, name + ': ' + script);
      assert.equal(isPublicStaticPath('/' + script), true);
    }
    assert.match(html, /site-experience\.css/);
  }
  assert.equal(isPublicStaticPath('/admin-icon-system.js'), true);
  assert.equal(isPublicStaticPath('/admin-session.js'), false);
});

test('autenticação legada não reaparece e login não depende de recarregar a página', () => {
  const server = read('server.js');
  assert.doesNotMatch(server, /function (?:makeToken|validToken|safeEqual)/);
  assert.doesNotMatch(server, /app\.post\('\/api\/admin\/login'/);
  assert.match(server, /authenticatedRequest\(req\)/);
  for (const name of ['admin.js', 'admin-secure-client.js', 'admin-users-management.js']) assert.doesNotMatch(read(name), /location\.reload/);
  for (const name of fs.readdirSync(root).filter(name => /^admin.*\.js$/.test(name))) assert.doesNotMatch(read(name), /(?<![\w.])(?:alert|confirm)\(/, name);
});

test('destaques vêm antes das marcas e conteúdo secundário do Admin é recolhível', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('id="home-selection"') < html.indexOf('id="marcas"'));
  assert.match(html, /analog-clock-brasilia/);
  assert.match(html, /id="home-carousel"/);
  assert.doesNotMatch(html, /id="home-selection-grid"/);
  assert.match(read('admin.html'), /<details class="admin-secondary"><summary>Análises de vendas e estoque/);
  assert.match(read('admin.html'), /<details class="admin-secondary"><summary>Diagnóstico técnico/);
  assert.doesNotMatch(read('home-enhancements.css'), /@import.*mobile-fixes/);
  assert.match(read('site-experience.css'), /prefers-reduced-motion/);
  assert.match(read('site-experience.css'), /\.home-selection-photo\{[^}]*display:flex[^}]*overflow:hidden/);
  assert.match(read('site-experience.css'), /\.home-selection-photo img\{[^}]*max-height:100%/);
});

test('carregamentos e diálogos têm sintaxe válida e não alteram APIs globais', () => {
  for (const name of ['site-ui.js', 'modal-accessibility.js', 'home-enhancements.js', 'admin-secure-client.js']) new vm.Script(read(name), { filename: name });
  assert.doesNotMatch(read('site-ui.js'), /window\.(?:fetch|alert|confirm)\s*=/);
  assert.match(read('modal-accessibility.js'), /sibling\.inert = true/);
  assert.match(read('modal-accessibility.js'), /event\.key === 'Escape'/);
  assert.match(read('admin.js'), /label for="invoice-status"/);
  assert.match(read('admin.js'), /label for="invoice-number"/);
  assert.match(read('admin.js'), /label for="invoice-key"/);
  assert.match(read('admin.html'), /label for="admin-email"/);
  assert.match(read('admin.html'), /label for="admin-senha"/);
});
