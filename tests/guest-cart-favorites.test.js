const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('carrinho e favoritos funcionam antes do login e checkout direciona para a conta', () => {
  const script = read('script.js');
  const favorites = read('favorites-client.js');
  const checkout = read('mercadopago-checkout-client.js');
  const account = read('conta.js');

  assert.match(script, /function adicionarAoCarrinho\(id, qtd = 1\)/);
  assert.doesNotMatch(
    script.slice(script.indexOf('function adicionarAoCarrinho'), script.indexOf('function removerDoCarrinho')),
    /sessaoAtual\(\)|login|conta\.html/
  );

  assert.match(favorites, /reloja_guest_favorites/);
  assert.match(favorites, /saveGuestIds/);
  assert.match(favorites, /\/api\/favorites\/import/);
  assert.doesNotMatch(favorites, /Entre para salvar este relógio/);

  assert.match(checkout, /conta\.html\?voltar=/);
  assert.match(checkout, /authentication_required/);
  assert.match(account, /safeReturnTarget/);
  assert.match(account, /mergeGuestFavorites/);
  assert.match(account, /carrinho\.html/);
});

test('importação de favoritos do visitante mescla com a conta e ignora produtos inválidos', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-guest-favorites-'));
  const previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;

  const usersPath = path.join(dataDir, 'users.json');
  const productsPath = path.join(dataDir, 'products.json');
  fs.writeFileSync(usersPath, JSON.stringify([
    { id: 'u1', email: 'teste@example.com', favorites: [{ product_id: 2, created_at: '2026-01-01T00:00:00.000Z' }] }
  ]));
  fs.writeFileSync(productsPath, JSON.stringify([
    { id: 1, nome: 'Um', ativo: true, preco: 100 },
    { id: 2, nome: 'Dois', ativo: true, preco: 200 },
    { id: 3, nome: 'Três', ativo: false, preco: 300 }
  ]));

  delete require.cache[require.resolve('../favorites')];
  const { registerFavoriteRoutes } = require('../favorites');
  const app = express();
  registerFavoriteRoutes(app, { userFromRequest: () => ({ id: 'u1' }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));

  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (previousDataDir == null) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/favorites/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [1, 2, 3, 999, 1] })
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.ids, [1, 2]);

  const stored = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  assert.deepEqual(stored[0].favorites.map(item => Number(item.product_id)), [1, 2]);
});

test('importação de favoritos continua exigindo autenticação', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-guest-favorites-auth-'));
  const previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  fs.writeFileSync(path.join(dataDir, 'users.json'), '[]');
  fs.writeFileSync(path.join(dataDir, 'products.json'), '[]');

  delete require.cache[require.resolve('../favorites')];
  const { registerFavoriteRoutes } = require('../favorites');
  const app = express();
  registerFavoriteRoutes(app, { userFromRequest: () => null });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));

  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (previousDataDir == null) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
  });

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/favorites/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [1] })
  });
  assert.equal(response.status, 401);
});
