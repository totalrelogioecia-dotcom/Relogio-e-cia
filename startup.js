require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  initPersistentStore,
  flushPersistentStore,
  closePersistentStore
} = require('./persistent-store');
const { runProductDataMigrations } = require('./product-data-migrations');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const USERS = path.join(DATA, 'users.json');
const RESET_TOKENS = path.join(DATA, 'password-reset-tokens.json');
const ACCOUNT_RESET = path.join(DATA, 'account-reset.json');
const PRODUCTS = path.join(DATA, 'products.json');
const PRODUCT_DETAILS = path.join(DATA, 'product-details.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function standardizeCurrentCatalogOnce() {
  const state = readJson(ACCOUNT_RESET, {});
  if (state?.catalog_standardization_2026_08_26?.completed) return;

  const products = readJson(PRODUCTS, []);
  if (!Array.isArray(products)) throw new Error('products.json inválido durante a padronização do catálogo.');

  const rawDetails = readJson(PRODUCT_DETAILS, {});
  const details = rawDetails && typeof rawDetails === 'object' && !Array.isArray(rawDetails) ? rawDetails : {};
  const updatedAt = new Date().toISOString();

  let standardized = 0;
  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    const id = Number(product?.id);
    products[index] = {
      ...product,
      preco: 500,
      ativo: true
    };

    if (Number.isFinite(id) && id > 0) {
      details[String(id)] = {
        ...(details[String(id)] || {}),
        garantia: '1 ano',
        conteudo_embalagem: 'Certificado de garantia + Manual + Relógio',
        updated_at: updatedAt
      };
    }
    standardized += 1;
  }

  writeJson(PRODUCTS, products);
  writeJson(PRODUCT_DETAILS, details);
  writeJson(ACCOUNT_RESET, {
    ...state,
    catalog_standardization_2026_08_26: {
      completed: true,
      products_standardized: standardized,
      price: 500,
      active: true,
      warranty: '1 ano',
      package_contents: 'Certificado de garantia + Manual + Relógio',
      completed_at: updatedAt
    }
  });

  console.log('Padronização única do catálogo concluída.', {
    produtos: standardized,
    preco: 500,
    visiveis: true,
    garantia: '1 ano'
  });
}

async function clearTestAccountsOnce() {
  const marker = readJson(ACCOUNT_RESET, {});
  if (marker?.completed) return;

  const users = readJson(USERS, []);
  const resetTokens = readJson(RESET_TOKENS, []);

  writeJson(USERS, []);
  writeJson(RESET_TOKENS, []);
  writeJson(ACCOUNT_RESET, {
    ...marker,
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
    // Mantém as migrações de dados e fichas técnicas já existentes.
    runProductDataMigrations();
    // Padronização solicitada em 26/08/2026: todos os produtos existentes ficam
    // visíveis, a R$ 500, com garantia de 1 ano e conteúdo de embalagem uniforme.
    // É uma migração única; alterações futuras no painel não serão sobrescritas.
    standardizeCurrentCatalogOnce();
    await clearTestAccountsOnce();
    await flushPersistentStore();
    // Instala a proteção do painel antes do bootstrap de autenticação e antes
    // das rotas administrativas do servidor.
    require('./admin-security-bootstrap');
    require('./auth-bootstrap');
    require('./server');
  } catch (error) {
    console.error('Falha ao inicializar armazenamento persistente:', error);
    process.exit(1);
  }
})();
