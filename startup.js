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
const BASE_CATALOG = path.join(__dirname, 'data', 'casio-official-catalog.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function normalizedSku(value) {
  return String(value || '').trim().toUpperCase();
}

function importBaseCatalogWatchesOnce() {
  const state = readJson(ACCOUNT_RESET, {});
  if (state?.base_catalog_watches_import_v1?.completed) return;

  const base = readJson(BASE_CATALOG, {});
  const source = base && typeof base === 'object' && !Array.isArray(base) ? base.products : null;
  const watches = source && typeof source === 'object' && !Array.isArray(source)
    ? Object.values(source).filter(item => String(item?.categoria || '').trim().toLowerCase() === 'relógios')
    : [];

  if (!watches.length) {
    throw new Error('Catálogo base sem relógios para a importação única.');
  }

  const products = readJson(PRODUCTS, []);
  if (!Array.isArray(products)) throw new Error('products.json inválido durante a importação do catálogo base.');

  const rawDetails = readJson(PRODUCT_DETAILS, {});
  const details = rawDetails && typeof rawDetails === 'object' && !Array.isArray(rawDetails) ? rawDetails : {};

  let nextId = products.reduce((max, product) => Math.max(max, Number(product?.id) || 0), 0);
  const bySku = new Map();
  products.forEach((product, index) => {
    const sku = normalizedSku(product?.sku);
    if (sku && !bySku.has(sku)) bySku.set(sku, index);
  });

  let added = 0;
  let existingStockSetToOne = 0;
  let skippedWithoutSku = 0;
  const importedAt = new Date().toISOString();

  for (const baseItem of watches) {
    const sku = normalizedSku(baseItem?.sku);
    if (!sku) {
      skippedWithoutSku += 1;
      continue;
    }

    const existingIndex = bySku.get(sku);
    if (existingIndex !== undefined) {
      if (Number(products[existingIndex]?.estoque) !== 1) {
        products[existingIndex] = { ...products[existingIndex], estoque: 1 };
        existingStockSetToOne += 1;
      }
      continue;
    }

    nextId += 1;
    const newProduct = {
      id: nextId,
      nome: String(baseItem?.nome || sku).trim(),
      marca: String(baseItem?.marca || '').trim(),
      categoria: 'Relógios',
      preco: 0,
      sku,
      desc: String(baseItem?.desc || '').trim(),
      fotos: Array.isArray(baseItem?.fotos) ? baseItem.fotos.filter(Boolean).slice(0, 8) : [],
      estoque: 1,
      ativo: false
    };

    products.push(newProduct);
    bySku.set(sku, products.length - 1);

    const baseDetails = baseItem?.detalhes && typeof baseItem.detalhes === 'object' && !Array.isArray(baseItem.detalhes)
      ? baseItem.detalhes
      : {};
    details[String(nextId)] = {
      ...baseDetails,
      garantia: String(baseDetails?.garantia || ''),
      conteudo_embalagem: String(baseDetails?.conteudo_embalagem || ''),
      updated_at: importedAt
    };
    added += 1;
  }

  writeJson(PRODUCTS, products);
  writeJson(PRODUCT_DETAILS, details);
  writeJson(ACCOUNT_RESET, {
    ...state,
    base_catalog_watches_import_v1: {
      completed: true,
      source: 'data/casio-official-catalog.json',
      base_watch_count: watches.length,
      added_to_products: added,
      existing_stock_set_to_one: existingStockSetToOne,
      skipped_without_sku: skippedWithoutSku,
      new_products_active: false,
      completed_at: importedAt
    }
  });

  console.log('Importação única do catálogo base concluída.', {
    base_watch_count: watches.length,
    added_to_products: added,
    existing_stock_set_to_one: existingStockSetToOne,
    skipped_without_sku: skippedWithoutSku,
    base_catalog_preserved: true
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
    // Mantém as migrações de dados/ficha técnica, mas não executa a antiga
    // migração automática de fotos. O catálogo restaurado do commit 1055198
    // passa a ser a fonte das URLs de imagem no PostgreSQL.
    runProductDataMigrations();
    await clearTestAccountsOnce();
    // Importa uma única vez os relógios do catálogo base para o cadastro normal.
    // O arquivo-base permanece intocado e não há sincronização automática futura.
    importBaseCatalogWatchesOnce();
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
