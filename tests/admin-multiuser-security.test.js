const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function signedLegacyToken(secret, email) {
  const body = Buffer.from(JSON.stringify({
    role: 'admin',
    email,
    exp: Date.now() + (60 * 60 * 1000)
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

test('central administrativa exibe somente módulos cujas abas estão disponíveis', () => {
  const hub = read('admin-favorites.js');
  assert.match(hub, /getComputedStyle\(button\)\.display!==['"]none['"]/);
  assert.match(hub, /attributeFilter:\[['"]style['"],['"]hidden['"]\]/);
});

test('painel aguarda a identidade antes de carregar produtos restritos', () => {
  const admin = read('admin.js');
  assert.match(admin, /function showDash\(admin=null\)/);
  assert.match(admin, /admin&&admin\.access_level!==['"]atendimento['"]/);
  assert.match(admin, /async function restoreDash\(\)/);
  assert.match(admin, /showDash\(d\.admin\)/);
  assert.doesNotMatch(admin, /if\(token\(\)\)showDash\(\);/);
});

test('persistência transforma gravações rejeitadas em erro operacional', () => {
  const { assertPersistentWrites } = require('../persistent-store');
  assert.doesNotThrow(() => assertPersistentWrites([{ status: 'fulfilled', value: undefined }]));
  assert.throws(
    () => assertPersistentWrites([{ status: 'rejected', reason: new Error('banco indisponível') }]),
    error => error instanceof AggregateError && /PostgreSQL/.test(error.message)
  );
});

test('Admin multiusuário aplica autenticação, níveis de acesso e revogação de sessão', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-admin-test-'));
  const envKeys = ['DATA_DIR', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET', 'NODE_ENV'];
  const previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const ownerEmail = 'owner@example.com';
  const ownerPassword = 'OwnerPassword123!';
  const sessionSecret = 'test-session-secret-with-more-than-32-characters';
  let server;

  process.env.DATA_DIR = dataDir;
  process.env.ADMIN_EMAIL = ownerEmail;
  process.env.ADMIN_PASSWORD = ownerPassword;
  process.env.ADMIN_SESSION_SECRET = sessionSecret;
  process.env.NODE_ENV = 'test';

  try {
    require('../admin-security-bootstrap');
    const express = require('express');
    const app = express();

    app.get('/api/admin/orders', (req, res) => res.json({ actor: req.admin.email }));
    app.get('/api/admin/coupons', (req, res) => res.json([{ code: 'NAO-DEVE-APARECER' }]));
    app.patch('/api/admin/orders/:id/fulfillment', (req, res) => res.json({ ok: true }));

    server = await new Promise((resolve, reject) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
      instance.once('error', reject);
    });
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;

    async function request(url, { method = 'GET', cookie = '', body } = {}) {
      const headers = { Accept: 'application/json' };
      if (cookie) headers.Cookie = cookie;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      return fetch(`${origin}${url}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    }

    async function login(email, senha) {
      const response = await request('/api/admin/login', {
        method: 'POST',
        body: { email, senha }
      });
      const data = await response.json();
      return {
        response,
        data,
        cookie: String(response.headers.get('set-cookie') || '').split(';')[0]
      };
    }

    const ownerLogin = await login(ownerEmail, ownerPassword);
    assert.equal(ownerLogin.response.status, 200);
    assert.ok(ownerLogin.cookie.startsWith('reloja_admin_session='));
    assert.equal(ownerLogin.data.admin.access_level, 'owner');
    assert.equal(Object.hasOwn(ownerLogin.data.admin, 'password_hash'), false);

    const legacyToken = signedLegacyToken(sessionSecret, ownerEmail);
    const legacySession = await request('/api/admin/session', {
      cookie: `reloja_admin_session=${encodeURIComponent(legacyToken)}`
    });
    assert.deepEqual(await legacySession.json(), { authenticated: false });

    const supportPassword = 'SupportPassword123!';
    const createResponse = await request('/api/admin/users', {
      method: 'POST',
      cookie: ownerLogin.cookie,
      body: {
        name: 'Equipe de Atendimento',
        email: 'support@example.com',
        password: supportPassword,
        access_level: 'atendimento'
      }
    });
    assert.equal(createResponse.status, 201);
    const supportUser = await createResponse.json();
    assert.equal(supportUser.access_level, 'atendimento');
    assert.equal(Object.hasOwn(supportUser, 'password_hash'), false);

    const supportLogin = await login(supportUser.email, supportPassword);
    assert.equal(supportLogin.response.status, 200);

    const allowedRead = await request('/api/admin/orders', { cookie: supportLogin.cookie });
    assert.equal(allowedRead.status, 200);

    const deniedCouponRead = await request('/api/admin/coupons', { cookie: supportLogin.cookie });
    assert.equal(deniedCouponRead.status, 403);

    const allowedFulfillment = await request('/api/admin/orders/PED-123/fulfillment', {
      method: 'PATCH',
      cookie: supportLogin.cookie,
      body: { status: 'shipped' }
    });
    assert.equal(allowedFulfillment.status, 200);

    const protectedOwner = await request(`/api/admin/users/${encodeURIComponent(ownerLogin.data.admin.id)}`, {
      method: 'PATCH',
      cookie: ownerLogin.cookie,
      body: { active: false }
    });
    assert.equal(protectedOwner.status, 400);

    const newSupportPassword = 'NewSupportPassword123!';
    const passwordChange = await request(`/api/admin/users/${encodeURIComponent(supportUser.id)}`, {
      method: 'PATCH',
      cookie: ownerLogin.cookie,
      body: { password: newSupportPassword }
    });
    assert.equal(passwordChange.status, 200);

    const revokedAfterPasswordChange = await request('/api/admin/orders', { cookie: supportLogin.cookie });
    assert.equal(revokedAfterPasswordChange.status, 401);

    const refreshedSupportLogin = await login(supportUser.email, newSupportPassword);
    assert.equal(refreshedSupportLogin.response.status, 200);

    const blockResponse = await request(`/api/admin/users/${encodeURIComponent(supportUser.id)}`, {
      method: 'PATCH',
      cookie: ownerLogin.cookie,
      body: { active: false }
    });
    assert.equal(blockResponse.status, 200);

    const revokedAfterBlock = await request('/api/admin/orders', { cookie: refreshedSupportLogin.cookie });
    assert.equal(revokedAfterBlock.status, 401);

    const storedUsers = fs.readFileSync(path.join(dataDir, 'admin-users.json'), 'utf8');
    assert.doesNotMatch(storedUsers, /OwnerPassword123|SupportPassword123|NewSupportPassword123/);
    const parsedUsers = JSON.parse(storedUsers);
    assert.ok(parsedUsers.every(user => /^scrypt\$/.test(user.password_hash)));
  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
