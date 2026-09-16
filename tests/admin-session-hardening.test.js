const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-admin-session-'));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_SESSION_SECRET = 'test-admin-secret-with-enough-entropy';

const session = require('../admin-session');
const usersFile = path.join(dataDir, 'admin-users.json');

function tokenFor(overrides = {}) {
  const payload = {
    role: 'admin',
    user_id: 'owner-1',
    session_version: 3,
    exp: Date.now() + 60_000,
    ...overrides
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function writeUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users), 'utf8');
}

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

test('sessão administrativa ativa é aceita pela validação central', () => {
  writeUsers([{ id: 'owner-1', name: 'Proprietário', email: 'OWNER@EXAMPLE.COM', access_level: 'owner', active: true, session_version: 3 }]);
  const payload = session.authenticatedToken(tokenFor());
  assert.equal(payload.email, 'owner@example.com');
  assert.equal(payload.access_level, 'owner');
});

test('bloqueio, exclusão e mudança de versão revogam a sessão administrativa', () => {
  writeUsers([{ id: 'owner-1', email: 'owner@example.com', access_level: 'owner', active: false, session_version: 3 }]);
  assert.equal(session.authenticatedToken(tokenFor()), null);

  writeUsers([]);
  assert.equal(session.authenticatedToken(tokenFor()), null);

  writeUsers([{ id: 'owner-1', email: 'owner@example.com', access_level: 'owner', active: true, session_version: 4 }]);
  assert.equal(session.authenticatedToken(tokenFor()), null);
});

test('requisição administrativa aceita cookie válido e rejeita bearer revogado', () => {
  writeUsers([{ id: 'owner-1', email: 'owner@example.com', access_level: 'owner', active: true, session_version: 3 }]);
  const token = tokenFor();
  assert.equal(session.authenticatedRequest({ headers: { cookie: `${session.COOKIE_NAME}=${encodeURIComponent(token)}` } }).user_id, 'owner-1');

  writeUsers([{ id: 'owner-1', email: 'owner@example.com', access_level: 'owner', active: true, session_version: 4 }]);
  assert.equal(session.authenticatedRequest({ headers: { authorization: `Bearer ${token}` } }), null);
});

test('modal administrativo gerencia foco, Escape e descrição acessível', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'admin-users-management.js'), 'utf8');
  assert.match(source, /aria-describedby="admin-users-modal-message"/);
  assert.match(source, /tabindex="-1"/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /event\.key !== 'Tab'/);
  assert.match(source, /previousFocus\.focus\(\)/);
});

test('sessão de cliente não usa o segredo administrativo como fallback', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'auth.js'), 'utf8');
  assert.doesNotMatch(source, /AUTH_SESSION_SECRET\s*\|\|\s*process\.env\.ADMIN_SESSION_SECRET/);
});

test('PostgreSQL valida certificado quando SSL está habilitado', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'persistent-store.js'), 'utf8');
  assert.match(source, /rejectUnauthorized:\s*true/);
  assert.doesNotMatch(source, /rejectUnauthorized:\s*false/);
});

test('Express confia somente no primeiro proxy da plataforma', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(source, /app\.set\('trust proxy',\s*1\)/);
  assert.doesNotMatch(source, /app\.set\('trust proxy',\s*true\)/);
});
