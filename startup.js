require('dotenv').config();

const {
  initPersistentStore,
  flushPersistentStore,
  closePersistentStore
} = require('./persistent-store');
const {
  startAccessTokenMaintenance,
  stopAccessTokenMaintenance
} = require('./melhorenvio-auth');
const { runStartupMigrations } = require('./startup-migrations');

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopAccessTokenMaintenance();
  const force = setTimeout(() => process.exit(1), 9000); force.unref();
  try { await flushPersistentStore(); await closePersistentStore(); process.exit(0); }
  catch (error) { console.error('Erro ao finalizar persistência:', error); process.exit(1); }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

(async () => {
  try {
    await initPersistentStore();
    await runStartupMigrations();
    await flushPersistentStore();
    startAccessTokenMaintenance();
    require('./admin-security-bootstrap');
    require('./admin-user-delete-route');
    require('./auth-bootstrap');
    require('./server');
  } catch (error) {
    console.error('Falha ao inicializar armazenamento persistente:', error);
    process.exit(1);
  }
})();
