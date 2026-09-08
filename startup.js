require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  initPersistentStore,
  flushPersistentStore,
  closePersistentStore
} = require('./persistent-store');
const {
  startAccessTokenMaintenance,
  stopAccessTokenMaintenance
} = require('./melhorenvio-auth');
const { runProductDataMigrations } = require('./product-data-migrations');
const { completeLaunchCatalogMetadata } = require('./catalog-completion-migration');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const USERS = path.join(DATA, 'users.json');
const RESET_TOKENS = path.join(DATA, 'password-reset-tokens.json');
const ACCOUNT_RESET = path.join(DATA, 'account-reset.json');
const PRODUCTS = path.join(DATA, 'products.json');
const PRODUCT_DETAILS = path.join(DATA, 'product-details.json');

const WARRANTY_TEXT = '1 ano';
const PACKAGE_CONTENTS_TEXT = 'Certificado de garantia + Manual + Relógio';

// Estado dos produtos que já existiam antes da importação do antigo estoque-base.
// Serve apenas para desfazer a padronização ampla aplicada por engano em 26/08/2026.
// Produtos posteriores a esse conjunto (IDs > 54, categoria Relógios) são os modelos
// importados da base que devem ser liberados por R$ 500,00.
const PREEXISTING_HIDDEN = Object.freeze({
  'TEC-LG-2201': 899.9,
  'TEC-SK-1187': 649,
  'TEC-EL-0942': 429.9,
  'CIT-ECO-778': 1899,
  'CIT-PRO-200': 2599,
  'CIT-ELG-514': 1349,
  'ORI-AUT-621': 1199,
  'ORI-KD-303': 1799,
  'ORI-SPT-118': 949,
  'ACC-PUL-020': 79.9,
  'ACC-PUL-018': 119.9,
  'GSH-PUL-SIL': 89.9,
  'ACC-PUL-NAT': 59.9,
  'ACC-PIL-626': 19.9,
  'ACC-PIL-2032': 17.9,
  'ACC-PIL-KIT': 69.9,
  'ACC-EST-006': 189.9,
  'ACC-FER-KIT': 99.9,
  'ACC-PRO-003': 34.9
});

const PREEXISTING_VISIBLE = Object.freeze({
  'GPR-H1000-9': 3999,
  'DW-5600UBB-1': 479,
  'GA-2100-1A': 799,
  'GA-2100-1A1': 799,
  'DW-5600UHR-1': 549,
  'DW-5600RL-1': 599,
  'GA-100-1A4': 699,
  'GA-100-1A2': 699,
  'GA-100-1A1': 699,
  'G-7900-2': 599,
  'G-7900A-4': 599,
  'DW-5600UE-1': 449,
  'DW-5750UE-1': 549,
  'AQ-230A-1DMQ': 259,
  'AQ-230A-7DMQ': 259,
  'A158WA-1': 259,
  'LA680WA-1B': 219,
  'LA680WA-7': 219,
  'MDV-107D-1A1V': 459,
  'MDV-107D-1A3V': 459,
  'MDV-107D-1A2V': 459,
  'LA670WGA-1': 289,
  'LA670WGA-9': 289,
  'A171WEG-9A': 329,
  'B640WB-1A': 349,
  'LA670WA-1': 249,
  'B640WC-5A': 349,
  'A159WGEA-1': 309,
  'AQ-230GA-9DMQ': 289
});

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

function originalProductState(sku) {
  if (Object.prototype.hasOwnProperty.call(PREEXISTING_HIDDEN, sku)) {
    return { preco: PREEXISTING_HIDDEN[sku], ativo: false };
  }
  if (Object.prototype.hasOwnProperty.call(PREEXISTING_VISIBLE, sku)) {
    return { preco: PREEXISTING_VISIBLE[sku], ativo: true };
  }
  return null;
}

function correctImportedCatalogReleaseOnce() {
  const state = readJson(ACCOUNT_RESET, {});
  if (state?.catalog_import_release_correction_2026_08_26?.completed) return;

  const products = readJson(PRODUCTS, []);
  if (!Array.isArray(products)) throw new Error('products.json inválido durante a correção do catálogo.');

  const rawDetails = readJson(PRODUCT_DETAILS, {});
  const details = rawDetails && typeof rawDetails === 'object' && !Array.isArray(rawDetails) ? rawDetails : {};
  const correctedAt = new Date().toISOString();

  let restoredPreexisting = 0;
  let releasedImported = 0;
  let detailsCleaned = 0;

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index] || {};
    const sku = normalizedSku(product.sku);
    const id = Number(product.id);
    const original = originalProductState(sku);

    if (original) {
      const needsRestore = Number(product.preco) !== Number(original.preco) || (product.ativo !== false) !== original.ativo;
      if (needsRestore) {
        products[index] = {
          ...product,
          preco: original.preco,
          ativo: original.ativo
        };
        restoredPreexisting += 1;
      }

      if (Number.isFinite(id) && id > 0 && details[String(id)]) {
        const current = { ...details[String(id)] };
        let changed = false;
        if (String(current.garantia || '') === WARRANTY_TEXT) {
          current.garantia = '';
          changed = true;
        }
        if (String(current.conteudo_embalagem || '') === PACKAGE_CONTENTS_TEXT) {
          current.conteudo_embalagem = '';
          changed = true;
        }
        if (changed) {
          current.updated_at = correctedAt;
          details[String(id)] = current;
          detailsCleaned += 1;
        }
      }
      continue;
    }

    // A importação do antigo catálogo-base começou depois do último ID 54 e trouxe
    // somente relógios. Esses são os únicos produtos aos quais se aplica a nova
    // padronização solicitada: visíveis, R$ 500, garantia de 1 ano e conteúdo fixo.
    const importedFromBase = Number.isFinite(id)
      && id > 54
      && String(product.categoria || '').trim().toLowerCase() === 'relógios';

    if (!importedFromBase) continue;

    products[index] = {
      ...product,
      preco: 500,
      ativo: true
    };
    details[String(id)] = {
      ...(details[String(id)] || {}),
      garantia: WARRANTY_TEXT,
      conteudo_embalagem: PACKAGE_CONTENTS_TEXT,
      updated_at: correctedAt
    };
    releasedImported += 1;
  }

  writeJson(PRODUCTS, products);
  writeJson(PRODUCT_DETAILS, details);
  writeJson(ACCOUNT_RESET, {
    ...state,
    catalog_import_release_correction_2026_08_26: {
      completed: true,
      restored_preexisting_products: restoredPreexisting,
      released_imported_watches: releasedImported,
      preexisting_details_cleaned: detailsCleaned,
      imported_price: 500,
      imported_active: true,
      imported_warranty: WARRANTY_TEXT,
      imported_package_contents: PACKAGE_CONTENTS_TEXT,
      completed_at: correctedAt
    }
  });

  console.log('Correção da liberação dos relógios importados concluída.', {
    restaurados: restoredPreexisting,
    importados_liberados: releasedImported,
    fichas_restauradas: detailsCleaned
  });
}

async function zeroAllProductStockOnce() {
  const state = readJson(ACCOUNT_RESET, {});
  const markerKey = 'zero_all_product_stock_2026_08_26';
  if (state?.[markerKey]?.completed) return;

  const products = readJson(PRODUCTS, []);
  if (!Array.isArray(products)) throw new Error('products.json inválido durante o zeramento de estoque.');

  const previousStock = [];
  let changedProducts = 0;
  let previousTotalStock = 0;

  const zeroedProducts = products.map(product => {
    const stock = Math.max(0, Number(product?.estoque) || 0);
    previousTotalStock += stock;
    previousStock.push({
      id: Number(product?.id) || null,
      sku: String(product?.sku || '').trim(),
      estoque: stock
    });
    if (stock > 0) changedProducts += 1;
    return { ...product, estoque: 0 };
  });

  const completedAt = new Date().toISOString();
  writeJson(PRODUCTS, zeroedProducts);
  writeJson(ACCOUNT_RESET, {
    ...state,
    [markerKey]: {
      completed: true,
      changed_products: changedProducts,
      total_products: zeroedProducts.length,
      previous_total_stock: previousTotalStock,
      previous_stock: previousStock,
      reason: 'Bloquear compras enquanto frete e checkout são validados',
      completed_at: completedAt
    }
  });

  await flushPersistentStore();
  console.log('Estoque de todos os produtos zerado uma única vez.', {
    produtos_alterados: changedProducts,
    produtos_totais: zeroedProducts.length,
    estoque_anterior_total: previousTotalStock
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
  stopAccessTokenMaintenance();
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
    // Corrige a alteração anterior: somente os relógios que vieram do antigo
    // estoque-base recebem preço R$ 500 e passam a ficar visíveis.
    correctImportedCatalogReleaseOnce();
    // Padroniza os metadados comerciais do catálogo sem tocar em preço, estoque ou fotos.
    completeLaunchCatalogMetadata();
    // Medida temporária de segurança: zera o estoque atual uma única vez para
    // impedir compras enquanto frete e checkout são validados. Depois deste
    // marcador, qualquer estoque recolocado manualmente no Admin é preservado.
    await zeroAllProductStockOnce();
    await clearTestAccountsOnce();
    await flushPersistentStore();
    startAccessTokenMaintenance();
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
