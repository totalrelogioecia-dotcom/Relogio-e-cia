const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const originalReadFileSync = fs.readFileSync.bind(fs);
const originalWriteFileSync = fs.writeFileSync.bind(fs);

const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const FILES = new Map([
  [path.resolve(path.join(DATA, 'products.json')), 'products'],
  [path.resolve(path.join(DATA, 'orders.json')), 'orders'],
  [path.resolve(path.join(DATA, 'users.json')), 'users'],
  [path.resolve(path.join(DATA, 'password-reset-tokens.json')), 'password_reset_tokens'],
  [path.resolve(path.join(DATA, 'shipping-products.json')), 'shipping_products']
]);

let pool = null;
let patched = false;
let ready = false;
const queues = new Map();

function jsonFromContent(content) {
  try {
    if (Buffer.isBuffer(content)) return JSON.parse(content.toString('utf8'));
    return JSON.parse(String(content));
  } catch {
    return null;
  }
}

function readLocalJson(file, fallback = []) {
  try {
    return JSON.parse(originalReadFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeLocalJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  originalWriteFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function databaseSsl(connectionString) {
  const configured = String(process.env.DATABASE_SSL || '').trim().toLowerCase();
  if (configured) {
    if (configured === 'false' || configured === '0' || configured === 'off') return false;
    return { rejectUnauthorized: false };
  }

  // No Render, a URL externa normalmente inclui sslmode=require; a URL interna não precisa TLS.
  try {
    const url = new URL(connectionString);
    const sslMode = String(url.searchParams.get('sslmode') || '').toLowerCase();
    if (sslMode === 'require' || sslMode === 'verify-ca' || sslMode === 'verify-full') {
      return { rejectUnauthorized: false };
    }
  } catch {}

  return false;
}

async function upsertState(key, value) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO relogio_state (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
}

function enqueuePersist(key, value) {
  if (!pool) return Promise.resolve();
  const previous = queues.get(key) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => upsertState(key, value))
    .catch(error => {
      console.error('Falha ao persistir no PostgreSQL:', { key, message: error.message });
      throw error;
    });
  queues.set(key, next);
  next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  }).catch(() => {});
  return next;
}

function patchFileWrites() {
  if (patched) return;
  patched = true;

  fs.writeFileSync = function patchedWriteFileSync(file, content, ...args) {
    const result = originalWriteFileSync(file, content, ...args);
    const absolute = path.resolve(String(file));
    const key = FILES.get(absolute);
    if (!key || !pool) return result;

    const parsed = jsonFromContent(content);
    if (parsed === null) {
      console.warn('Arquivo persistente escrito com JSON inválido; banco não alterado:', absolute);
      return result;
    }

    enqueuePersist(key, parsed).catch(() => {});
    return result;
  };
}

async function initPersistentStore() {
  fs.mkdirSync(DATA, { recursive: true });
  const connectionString = String(process.env.DATABASE_URL || '').trim();

  if (!connectionString) {
    console.warn('DATABASE_URL ausente: usando arquivos locais temporários. Configure PostgreSQL antes de produção.');
    patchFileWrites();
    return { persistent: false, provider: 'local-files' };
  }

  pool = new Pool({
    connectionString,
    ssl: databaseSsl(connectionString),
    max: Math.max(2, Number(process.env.DATABASE_POOL_MAX || 5)),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });

  await pool.query('SELECT 1');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS relogio_state (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const [file, key] of FILES.entries()) {
    const result = await pool.query('SELECT value FROM relogio_state WHERE key = $1', [key]);

    if (result.rows.length) {
      writeLocalJson(file, result.rows[0].value ?? []);
      console.log('Dados carregados do PostgreSQL:', key);
      continue;
    }

    const seedFallback = key === 'shipping_products' ? {} : [];
    const seed = readLocalJson(file, seedFallback);
    await upsertState(key, seed);
    writeLocalJson(file, seed);
    console.log('Dados migrados para PostgreSQL:', { key, registros: Array.isArray(seed) ? seed.length : Object.keys(seed || {}).length });
  }

  patchFileWrites();
  ready = true;
  console.log('PostgreSQL persistente ativo para produtos, pedidos, usuários, tokens de recuperação e dados de frete.');
  return { persistent: true, provider: 'postgresql' };
}

async function flushPersistentStore() {
  const pending = Array.from(queues.values());
  if (pending.length) await Promise.allSettled(pending);
}

async function closePersistentStore() {
  await flushPersistentStore();
  if (pool) {
    const current = pool;
    pool = null;
    await current.end().catch(() => {});
  }
}

function storageStatus() {
  return {
    persistent: Boolean(pool && ready),
    provider: pool && ready ? 'postgresql' : 'local-files',
    pendingWrites: queues.size
  };
}

module.exports = {
  initPersistentStore,
  flushPersistentStore,
  closePersistentStore,
  storageStatus
};
