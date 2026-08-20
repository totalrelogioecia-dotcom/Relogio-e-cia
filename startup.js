require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  initPersistentStore,
  flushPersistentStore,
  closePersistentStore
} = require('./persistent-store');
const { runProductDataMigrations } = require('./product-data-migrations');
const { runProductPhotoMigrations } = require('./product-photo-migrations');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const USERS = path.join(DATA, 'users.json');
const RESET_TOKENS = path.join(DATA, 'password-reset-tokens.json');
const ACCOUNT_RESET = path.join(DATA, 'account-reset.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

async function clearTestAccountsOnce() {
  const marker = readJson(ACCOUNT_RESET, {});
  if (marker?.completed) return;

  const users = readJson(USERS, []);
  const resetTokens = readJson(RESET_TOKENS, []);

  writeJson(USERS, []);
  writeJson(RESET_TOKENS, []);
  writeJson(ACCOUNT_RESET, {
    completed: true,
    reason: 'clear-test-accounts-2026-08-20',
    cleared_users: Array.isArray(users) ? users.length : 0,
    cleared_reset_tokens: Array.isArray(resetTokens) ? resetTokens.length : 0,
    completed_at: new Date().toISOString()
  });

  await flushPersistentStore();
  console.log('Limpeza única de contas de teste concluída.', {
    users: Array.isArray(users) ? users.length : 0,
    reset_tokens: Array.isArray(resetTokens) ? resetTokens.length : 0
  });
}

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Encerrando aplicação (${signal}) e sincronizando dados persistentes...`);

  const force = setTimeout(() => process.exit(1), 9000);
  force.unref();

  try {
    await flushPersistentStore();
    await closePersistentStore();
    process.exit(0);
  } catch (error) {
    console.error('Erro ao finalizar persistência:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

(async () => {
  try {
    await initPersistentStore();
    // As migrações rodam somente depois de o conteúdo persistido do PostgreSQL
    // ser materializado nos arquivos locais; assim as correções chegam ao banco
    // em vez de serem substituídas pelos dados antigos durante o boot.
    runProductDataMigrations();
    runProductPhotoMigrations();
    await clearTestAccountsOnce();
    await flushPersistentStore();
    require('./auth-bootstrap');
    require('./server');
  } catch (error) {
    console.error('Falha ao inicializar armazenamento persistente:', error);
    process.exit(1);
  }
})();
