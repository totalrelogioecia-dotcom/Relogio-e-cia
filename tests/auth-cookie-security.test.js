const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

test('cadastro usa cookie HttpOnly e troca de senha invalida a sessão anterior', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-auth-cookie-'));
  process.env.DATA_DIR = dataDir;
  process.env.AUTH_SESSION_SECRET = 'test-secret-with-enough-entropy-123';
  delete process.env.PUBLIC_URL;
  const { registerAuthRoutes } = require('../auth');
  const app = express();
  registerAuthRoutes(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const registration = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      nome: 'Cliente Teste',
      email: 'cliente@example.com',
      senha: 'senha-segura-123',
      telefone: { area_code: '51', number: '999999999' },
      identificacao: { type: 'CPF', number: '12345678909' },
      endereco: {
        zip_code: '90000000', street_name: 'Rua Teste', street_number: '10',
        neighborhood: 'Centro', city_name: 'Porto Alegre', state_code: 'RS'
      }
    })
  });
  assert.equal(registration.status, 201);
  const registrationData = await registration.json();
  assert.equal(Object.hasOwn(registrationData, 'token'), false);
  const oldCookie = registration.headers.get('set-cookie').split(';')[0];
  assert.match(registration.headers.get('set-cookie'), /HttpOnly/);
  assert.equal((await fetch(`${base}/api/auth/me`, { headers: { cookie: oldCookie } })).status, 200);

  const users = JSON.parse(fs.readFileSync(path.join(dataDir, 'users.json'), 'utf8'));
  const rawReset = 'reset-token-for-test';
  fs.writeFileSync(path.join(dataDir, 'password-reset-tokens.json'), JSON.stringify([{
    token_hash: crypto.createHash('sha256').update(rawReset).digest('hex'),
    user_id: users[0].id,
    email: users[0].email,
    expires_at: Date.now() + 60_000
  }]));

  const reset = await fetch(`${base}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: rawReset, senha: 'outra-senha-segura-456' })
  });
  assert.equal(reset.status, 200);
  assert.equal(Object.hasOwn(await reset.clone().json(), 'token'), false);
  const newCookie = reset.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${base}/api/auth/me`, { headers: { cookie: oldCookie } })).status, 401);
  assert.equal((await fetch(`${base}/api/auth/me`, { headers: { cookie: newCookie } })).status, 200);
});
