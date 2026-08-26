const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const { buildProductShippingDiagnostic } = require('../store-health');

const readText = file => fs.readFileSync(path.join(root, file), 'utf8');

test('G-Shock com peso usa caixa M automática e fica pronto para frete', () => {
  const result = buildProductShippingDiagnostic(
    { id: 1, nome: 'G-Shock Teste', marca: 'G-Shock', categoria: 'Relógios', estoque: 1, ativo: true },
    { weight_kg: 0.45 }
  );

  assert.equal(result.ready, true);
  assert.equal(result.box_size, 'M');
  assert.equal(result.box_source, 'automática');
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.dimensions, { width_cm: 15, height_cm: 12, length_cm: 15 });
});

test('Casio sem caixa exige dimensões manuais além do peso', () => {
  const result = buildProductShippingDiagnostic(
    { id: 2, nome: 'Casio Teste', marca: 'Casio', categoria: 'Relógios', estoque: 1, ativo: true },
    { weight_kg: 0.25 }
  );

  assert.equal(result.ready, false);
  assert.equal(result.box_size, null);
  assert.deepEqual(result.missing, ['largura', 'altura', 'comprimento']);
});

test('caixa automática não dispensa peso do produto', () => {
  const result = buildProductShippingDiagnostic(
    { id: 3, nome: 'Orient Teste', marca: 'Orient', categoria: 'Relógios', estoque: 1, ativo: true },
    {}
  );

  assert.equal(result.ready, false);
  assert.equal(result.box_size, 'P');
  assert.deepEqual(result.missing, ['peso']);
});

test('painel carrega diagnóstico protegido e mostra frete incompleto', () => {
  const page = readText('admin.html');
  const client = readText('admin-store-health.js');
  const bootstrap = readText('store-health-bootstrap.js');
  const pkg = JSON.parse(readText('package.json'));

  assert.match(page, /id="store-health-panel"/);
  assert.match(page, /Produtos com frete incompleto/);
  assert.match(client, /\/api\/admin\/store-health/);
  assert.match(client, /blocking_in_stock/);
  assert.match(bootstrap, /reloja_admin_session/);
  assert.match(bootstrap, /validAdminToken/);
  assert.match(pkg.scripts.start, /store-health-bootstrap\.js/);
});
