const fs = require('fs');
const path = require('path');

const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PRODUCTS = path.join(DATA, 'products.json');
const ACCOUNT_RESET = path.join(DATA, 'account-reset.json');
const MARKER = 'verified_missing_photos_2026_08_25_v1';

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

const VERIFIED = {
  'DW-5600UHR-1': 'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/D/DW/DW5/dw-5600uhr-1/assets/DW-5600UHR-1.png.transform/main-visual-sp/image.png',
  'DW-5600RL-1': 'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/D/DW/DW5/dw-5600rl-1/assets/DW-5600RL-1.png.transform/main-visual-sp/image.png'
};

function normalizeSku(value) {
  return String(value || '').trim().toUpperCase();
}

function runVerifiedMissingPhotoFix() {
  const meta = readJson(ACCOUNT_RESET, {});
  if (meta && meta[MARKER]) return false;

  const products = readJson(PRODUCTS, []);
  if (!Array.isArray(products)) return false;

  const changed = [];
  for (const product of products) {
    if (String(product?.nome || '').trim().toLowerCase() === 'teste 5') continue;
    const sku = normalizeSku(product?.sku);
    const url = VERIFIED[sku];
    if (!url) continue;
    product.fotos = [url];
    if (product.foto) delete product.foto;
    changed.push(sku);
  }

  if (!changed.length) return false;

  writeJson(PRODUCTS, products);
  writeJson(ACCOUNT_RESET, {
    ...(meta && typeof meta === 'object' ? meta : {}),
    [MARKER]: true,
    verified_missing_photos_at: new Date().toISOString(),
    verified_missing_photos_skus: changed
  });

  console.log(`Fotos validadas diretamente na Casio aplicadas: ${changed.join(', ')}`);
  return true;
}

module.exports = { runVerifiedMissingPhotoFix };
