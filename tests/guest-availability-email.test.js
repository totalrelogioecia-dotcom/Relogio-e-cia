const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

test('visitante consulta por e-mail sem receber liberação de compra', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-consulta-email-'));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  fs.writeFileSync(path.join(dir, 'products.json'), JSON.stringify([{ id: 7, ativo: true, nome: 'Relógio teste', marca: 'Casio', sku: 'CAS-7', preco: 100 }]));
  fs.writeFileSync(path.join(dir, 'product-details.json'), JSON.stringify({ 7: { disponibilidade: 'mediante_confirmacao' } }));
  for (const moduleName of ['../availability-requests', '../confirmation-purchase-service', '../product-availability-service']) {
    delete require.cache[require.resolve(moduleName)];
  }
  const { registerAvailabilityRequestRoutes } = require('../availability-requests');
  const { releasePurchase, customerPurchases } = require('../confirmation-purchase-service');
  const app = express();
  registerAvailabilityRequestRoutes(app, {
    userFromRequest: req => req.headers['x-test-account'] ? { id: 'u1', email: 'cliente@example.com', nome: 'Cliente' } : null
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
  });
  const post = (body, account = false) => fetch(base + '/api/availability-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(account ? { 'x-test-account': '1' } : {}) },
    body: JSON.stringify({ product_id: 7, source: 'catalog', ...body })
  });

  const missing = await post({});
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).code, 'email_required');
  const invalid = await post({ email: 'sem-arroba' });
  assert.equal(invalid.status, 400);

  const first = await post({ email: ' Cliente@Example.com ' });
  assert.equal(first.status, 201);
  const firstData = await first.json();
  assert.equal(firstData.request.guest, true);
  assert.equal(firstData.request.purchase, null);
  assert.equal(firstData.request.customer, undefined);

  const duplicate = await post({ email: 'cliente@example.com' });
  assert.equal(duplicate.status, 200);
  const duplicateData = await duplicate.json();
  assert.equal(duplicateData.duplicate, true);
  assert.equal(duplicateData.request.id, firstData.request.id);
  assert.equal(duplicateData.request.customer, undefined);

  await assert.rejects(() => releasePurchase(firstData.request.id), error => error.status === 409);
  assert.equal(customerPurchases({ id: 'u1', email: 'cliente@example.com' }).length, 0);

  const account = await post({}, true);
  assert.equal(account.status, 201);
  const accountData = await account.json();
  assert.equal(accountData.request.guest, false);
  assert.notEqual(accountData.request.id, firstData.request.id);

  const records = JSON.parse(fs.readFileSync(path.join(dir, 'availability-requests.json'), 'utf8'));
  assert.equal(records.length, 2);
  assert.equal(records[0].customer.email, 'cliente@example.com');
  assert.equal(records[0].customer.user_id, '');
  assert.equal(records[1].customer.user_id, 'u1');
});
