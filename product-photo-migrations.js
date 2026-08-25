const fs = require('fs');
const path = require('path');

const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PRODUCTS = path.join(DATA, 'products.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

// Fotos oficiais hospedadas pela própria Casio.
// Somente as referências que estavam com URL quebrada foram trocadas.
// As demais URLs que já funcionavam permanecem exatamente como estavam.
const OFFICIAL_PHOTOS = {
  'F-91W-1': [
    'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/F/F9/F91/F-91W-1/assets/F-91W-1_Seq1.png.transform/main-visual-sp/image.png',
    'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/F/F9/F91/F-91W-1/assets/F-91W-1_kv.jpg.transform/main-visual-sp/image.jpg'
  ],
  'GPR-H1000-9': [
    'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/G/GP/GPR/GPR-H1000-9/assets/GPR-H1000-9.png.transform/main-visual-sp/image.png'
  ],
  'DW-5600UBB-1': [
    'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/D/DW/DW5/DW-5600UBB-1/assets/DW-5600UBB-1.png.transform/main-visual-sp/image.png'
  ],
  'GA-2100-1A': [
    'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/G/GA/GA2/GA-2100-1A/assets/GA-2100-1A_Seq1.png.transform/main-visual-sp/image.png',
    'https://www.casio.com/content/dam/casio/product-info/locales/us/en/timepiece/product/watch/G/GA/GA2/GA-2100-1A/us-assets/GA-2100-1A.png'
  ],
  'GA-2100-1A1': [
    'https://www.casio.com/content/dam/casio/product-info/locales/us/en/timepiece/product/watch/G/GA/GA2/GA-2100-1A1/us-assets/GA-2100-1A1.png',
    'https://www.casio.com/content/dam/casio/product-info/locales/us/en/timepiece/product/watch/G/GA/GA2/GA-2100-1A1/us-assets/GA-2100-1A1.png.transform/main-visual-pc/image.png'
  ],
  'DW-5600UHR-1': ['https://www.casio.com/content/dam/casio/product-info/locales/us/en/timepiece/product/watch/D/DW/DW5/DW-5600UHR-1/us-assets/DW-5600UHR-1.png'],
  'DW-5600RL-1': ['https://www.casio.com/content/dam/casio/product-info/locales/us/en/timepiece/product/watch/D/DW/DW5/DW-5600RL-1/us-assets/DW-5600RL-1.png'],
  'GA-100-1A4': ['https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/G/GA/GA1/GA-100-1A4/assets/GA-100-1A4_Seq1.png.transform/main-visual-sp/image.png'],
  'GA-100-1A2': ['https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/G/GA/GA1/GA-100-1A2/assets/GA-100-1A2_Seq1.png.transform/main-visual-sp/image.png'],
  'GA-100-1A1': ['https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/G/GA/GA1/GA-100-1A1/assets/GA-100-1A1_Seq1.png.transform/main-visual-sp/image.png'],
  'G-7900-2': ['https://www.casio.com/content/dam/casio/product-info/locales/us/en/timepiece/product/watch/G/G7/G79/G-7900-2/us-assets/G-7900-2.png'],
  'G-7900A-4': ['https://www.casio.com/content/dam/casio/product-info/locales/us/en/timepiece/product/watch/G/G7/G79/G-7900A-4/us-assets/G-7900A-4.png'],
  'DW-5600UE-1': ['https://www.casio.com/content/dam/casio/product-info/locales/us/en/timepiece/product/watch/D/DW/DW5/DW-5600UE-1/us-assets/DW-5600UE-1.png'],
  'DW-5750UE-1': [
    'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/D/DW/DW5/dw-5750ue-1/assets/DW-5750UE-1.png.transform/main-visual-sp/image.png',
    'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/D/DW/DW5/dw-5750ue-1/assets/DW-5750UE-1_LED.png.transform/main-visual-sp/image.png'
  ],
  'AQ-230A-1DMQ': [
    'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/A/AQ/AQ2/AQ-230A-1DMQ/assets/AQ-230A-1DMQ_01.png.transform/main-visual-sp/image.png',
    'https://www.casio.com/content/dam/casio/product-info/locales/us/en/timepiece/product/watch/A/AQ/AQ2/AQ-230A-1DMQ/assets/AQ-230A-1DMQ.png'
  ],
  'AQ-230A-7DMQ': [
    'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/A/AQ/AQ2/AQ-230A-7DMQ/assets/AQ-230A-7DMQ_Seq1.png.transform/main-visual-sp/image.png'
  ],
  'A158WA-1': ['https://www.casio.com/content/dam/casio/product-info/locales/us/en/timepiece/product/watch/A/A1/A15/A158WA-1/assets/A158WA-1.png'],
  'LA680WA-1B': [
    'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/L/LA/LA6/LA680WA-1B/assets/LA680WA-1B.png.transform/main-visual-sp/image.png'
  ],
  'LA680WA-7': [
    'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/L/LA/LA6/LA680WA-7/assets/LA680WA-7.png.transform/main-visual-sp/image.png'
  ],
  'MDV-107D-1A1V': [
    'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/M/md/mdv/mdv-107d-1a1v/assets/MDV-107D-1A1V.png.transform/main-visual-sp/image.png',
    'https://www.casio.com/content/dam/casio/product-info/locales/us/en/timepiece/product/watch/M/MD/MDV/MDV-107D-1A1V/assets/MDV-107D-1A1V.png'
  ],
  'MDV-107D-1A3V': [
    'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/M/md/mdv/mdv-107d-1a3v/assets/MDV-107D-1A3V.png.transform/main-visual-sp/image.png'
  ],
  'MDV-107D-1A2V': [
    'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/M/md/mdv/mdv-107d-1a2v/assets/MDV-107D-1A2V.png.transform/main-visual-sp/image.png'
  ],
  'LA670WGA-1': [
    'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/L/LA/LA6/LA670WGA-1/assets/LA670WGA-1.png.transform/main-visual-sp/image.png',
    'https://www.casio.com/content/dam/casio/product-info/locales/us/en/timepiece/product/watch/L/LA/LA6/LA670WGA-1/assets/LA670WGA-1.png'
  ],
  'LA670WGA-9': ['https://www.casio.com/content/dam/casio/product-info/locales/us/en/timepiece/product/watch/L/LA/LA6/LA670WGA-9/assets/LA670WGA-9.png'],
  'A171WEG-9A': [
    'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/A/A1/A17/A171WEG-9A/assets/A171WEG-9A.png.transform/main-visual-sp/image.png'
  ],
  'B640WB-1A': [
    'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/B/B6/B64/B640WB-1A/assets/B640WB-1A.png.transform/main-visual-sp/image.png'
  ],
  'LA670WA-1': ['https://www.casio.com/content/dam/casio/product-info/locales/us/en/timepiece/product/watch/L/LA/LA6/LA670WA-1/assets/LA670WA-1.png'],
  'B640WC-5A': [
    'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/B/B6/B64/B640WC-5A/assets/B640WC-5A.png.transform/main-visual-sp/image.png'
  ],
  'A159WGEA-1': ['https://www.casio.com/content/dam/casio/product-info/locales/us/en/timepiece/product/watch/A/A1/A15/A159WGEA-1/assets/A159WGEA-1.png'],
  'AQ-230GA-9DMQ': ['https://www.casio.com/content/dam/casio/product-info/locales/us/en/timepiece/product/watch/A/AQ/AQ2/AQ-230GA-9DMQ/assets/AQ-230GA-9DMQ.png']
};

function normalizeSku(value) {
  return String(value || '').trim().toUpperCase();
}

function isCasioHosted(value) {
  try {
    const u = new URL(String(value || ''));
    return u.hostname === 'www.casio.com' && u.pathname.startsWith('/content/dam/casio/');
  } catch {
    return false;
  }
}

function samePhotos(a, b) {
  return JSON.stringify(a || []) === JSON.stringify(b || []);
}

function runProductPhotoMigrations() {
  const products = readJson(PRODUCTS, []);
  if (!Array.isArray(products)) return false;

  let changed = 0;
  for (const product of products) {
    // O produto Teste 5 não é alterado.
    if (String(product?.nome || '').trim().toLowerCase() === 'teste 5') continue;

    const sku = normalizeSku(product?.sku);
    const photos = OFFICIAL_PHOTOS[sku];
    if (!photos || !photos.length) continue;

    const current = Array.isArray(product.fotos) ? product.fotos.filter(Boolean) : [];
    const hasManualPhoto = current.some(url => !isCasioHosted(url));
    if (hasManualPhoto) continue;
    if (samePhotos(current, photos)) continue;

    product.fotos = [...photos];
    changed += 1;
  }

  if (!changed) return false;
  writeJson(PRODUCTS, products);
  console.log(`Migração aplicada: fotos oficiais sincronizadas em ${changed} produto(s) Casio/G-Shock.`);
  return true;
}

module.exports = { runProductPhotoMigrations };
