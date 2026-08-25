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
  [path.resolve(path.join(DATA, 'shipping-products.json')), 'shipping_products'],
  [path.resolve(path.join(DATA, 'product-details.json')), 'product_details'],
  [path.resolve(path.join(DATA, 'melhorenvio-auth.json')), 'melhorenvio_auth'],
  [path.resolve(path.join(DATA, 'account-reset.json')), 'account_reset'],
  [path.resolve(path.join(DATA, 'return-requests.json')), 'return_requests']
]);

const PRODUCT_RESTORE_MARKER = 'products_restored_from_commit_1055198_2026_08_25';
const PRODUCT_BACKUP_KEY = 'products_backup_before_restore_1055198_2026_08_25';

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

  const restoreMarker = await pool.query(
    'SELECT value FROM relogio_state WHERE key = $1',
    [PRODUCT_RESTORE_MARKER]
  );
  const shouldRestoreProducts = restoreMarker.rows.length === 0;

  for (const [file, key] of FILES.entries()) {
    if (key === 'products' && shouldRestoreProducts) {
      // Neste deploy o arquivo local é exatamente o catálogo do commit 1055198.
      // Fazemos backup do catálogo atual do banco e, uma única vez, usamos esse
      // arquivo como fonte autoritativa para a chave `products` do PostgreSQL.
      const desiredProducts = readLocalJson(file, []);
      const currentProducts = await pool.query(
        'SELECT value FROM relogio_state WHERE key = $1',
        ['products']
      );

      if (currentProducts.rows.length) {
        const existingBackup = await pool.query(
          'SELECT value FROM relogio_state WHERE key = $1',
          [PRODUCT_BACKUP_KEY]
        );
        if (!existingBackup.rows.length) {
          await upsertState(PRODUCT_BACKUP_KEY, currentProducts.rows[0].value ?? []);
        }
      }

      await upsertState('products', desiredProducts);
      await upsertState(PRODUCT_RESTORE_MARKER, {
        completed: true,
        source_commit: '1055198b3485870e4562d47dce8fd3f53fd89733',
        restored_at: new Date().toISOString(),
        product_count: Array.isArray(desiredProducts) ? desiredProducts.length : 0,
        backup_key: PRODUCT_BACKUP_KEY
      });
      writeLocalJson(file, desiredProducts);
      console.log('Catálogo de produtos restaurado do commit 1055198 e backup salvo no PostgreSQL.', {
        registros: Array.isArray(desiredProducts) ? desiredProducts.length : 0,
        backup_key: PRODUCT_BACKUP_KEY
      });
      continue;
    }

    const result = await pool.query('SELECT value FROM relogio_state WHERE key = $1', [key]);

    if (result.rows.length) {
      writeLocalJson(file, result.rows[0].value ?? []);
      console.log('Dados carregados do PostgreSQL:', key);
      continue;
    }

    const seedFallback = ['shipping_products', 'product_details', 'melhorenvio_auth', 'account_reset'].includes(key) ? {} : [];
    const seed = readLocalJson(file, seedFallback);
    await upsertState(key, seed);
    writeLocalJson(file, seed);
    console.log('Dados migrados para PostgreSQL:', { key, registros: Array.isArray(seed) ? seed.length : Object.keys(seed || {}).length });
  }

  patchFileWrites();
  ready = true;
  console.log('PostgreSQL persistente ativo para produtos, pedidos, usuários, tokens de recuperação, frete, fichas técnicas, OAuth do Melhor Envio, solicitações de pós-venda e migrações administrativas.');
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
