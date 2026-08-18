require('dotenv').config();

const {
  initPersistentStore,
  flushPersistentStore,
  closePersistentStore
} = require('./persistent-store');
const { runProductDataMigrations } = require('./product-data-migrations');
const { runProductPhotoMigrations } = require('./product-photo-migrations');

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
    await flushPersistentStore();
    require('./auth-bootstrap');
    require('./server');
  } catch (error) {
    console.error('Falha ao inicializar armazenamento persistente:', error);
    process.exit(1);
  }
})();
