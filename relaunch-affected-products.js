const fs = require('fs');
const path = require('path');

const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PRODUCTS = path.join(DATA, 'products.json');
const ACCOUNT_RESET = path.join(DATA, 'account-reset.json');
const MARKER = 'affected_products_relaunched_2026_08_25_v1';

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function sku(value) {
  return String(value || '').trim().toUpperCase();
}

const RELAUNCH = [
  {
    sku: 'F-91W-1', aliases: ['F-91W-1', 'CAS-F91W'], nome: 'Casio F-91W-1', marca: 'Casio',
    fotos: ['https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/F/F9/F91/F-91W-1/assets/F-91W-1_Seq1.png.transform/main-visual-sp/image.png']
  },
  {
    sku: 'A168WA-1', aliases: ['A168WA-1', 'CAS-A168-01'], nome: 'Casio Vintage A168WA-1', marca: 'Casio',
    fotos: ['https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/A/A1/A16/A168WA-1/assets/A168WA-1_01.jpg.transform/main-visual-sp/image.jpg']
  },
  {
    sku: 'EFV-620D-1A2V', aliases: ['EFV-620D-1A2V', 'CAS-EDI-330'], nome: 'Casio Edifice EFV-620D-1A2V', marca: 'Casio',
    fotos: ['https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/E/EF/EFV/efv-620d-1a2v/assets/EFV-620D-1A2VU.png.transform/main-visual-sp/image.png']
  },
  {
    sku: 'GPR-H1000-9', aliases: ['GPR-H1000-9'], marca: 'G-Shock',
    fotos: ['https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/G/GP/GPR/GPR-H1000-9/assets/GPR-H1000-9.png.transform/main-visual-sp/image.png']
  },
  {
    sku: 'DW-5600UBB-1', aliases: ['DW-5600UBB-1'], marca: 'G-Shock',
    fotos: ['https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/D/DW/DW5/DW-5600UBB-1/assets/DW-5600UBB-1.png.transform/main-visual-sp/image.png']
  },
  {
    sku: 'GA-100-1A4', aliases: ['GA-100-1A4'], marca: 'G-Shock',
    fotos: ['https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/G/GA/GA1/GA-100-1A4/assets/GA-100-1A4_Seq1.png.transform/main-visual-sp/image.png']
  },
  {
    sku: 'GA-100-1A2', aliases: ['GA-100-1A2'], marca: 'G-Shock',
    fotos: ['https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/G/GA/GA1/GA-100-1A2/assets/GA-100-1A2_Seq1.png.transform/main-visual-sp/image.png']
  },
  {
    sku: 'GA-100-1A1', aliases: ['GA-100-1A1'], marca: 'G-Shock',
    fotos: ['https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/G/GA/GA1/GA-100-1A1/assets/GA-100-1A1_Seq1.png.transform/main-visual-sp/image.png']
  },
  {
    sku: 'DW-5750UE-1', aliases: ['DW-5750UE-1'], marca: 'G-Shock',
    fotos: ['https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/D/DW/DW5/dw-5750ue-1/assets/DW-5750UE-1.png.transform/main-visual-sp/image.png']
  },
  {
    sku: 'AQ-230A-7DMQ', aliases: ['AQ-230A-7DMQ'], marca: 'Casio',
    fotos: ['https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/A/AQ/AQ2/AQ-230A-7DMQ/assets/AQ-230A-7DMQ_Seq1.png.transform/main-visual-sp/image.png']
  },
  {
    sku: 'LA680WA-1B', aliases: ['LA680WA-1B'], marca: 'Casio',
    fotos: ['https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/L/LA/LA6/LA680WA-1B/assets/LA680WA-1B.png.transform/main-visual-sp/image.png']
  },
  {
    sku: 'LA680WA-7', aliases: ['LA680WA-7'], marca: 'Casio',
    fotos: ['https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/L/LA/LA6/LA680WA-7/assets/LA680WA-7.png.transform/main-visual-sp/image.png']
  },
  {
    sku: 'A171WEG-9A', aliases: ['A171WEG-9A'], marca: 'Casio',
    fotos: ['https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/A/A1/A17/A171WEG-9A/assets/A171WEG-9A.png.transform/main-visual-sp/image.png']
  },
  {
    sku: 'B640WB-1A', aliases: ['B640WB-1A'], marca: 'Casio',
    fotos: ['https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/B/B6/B64/B640WB-1A/assets/B640WB-1A.png.transform/main-visual-sp/image.png']
  },
  {
    sku: 'B640WC-5A', aliases: ['B640WC-5A'], marca: 'Casio',
    fotos: ['https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/B/B6/B64/B640WC-5A/assets/B640WC-5A.png.transform/main-visual-sp/image.png']
  }
];

function matches(product, spec) {
  const currentSku = sku(product?.sku);
  if (spec.aliases.map(sku).includes(currentSku)) return true;
  if (spec.sku === 'A168WA-1' && /CASIO\s+VINTAGE\s+A168/i.test(String(product?.nome || ''))) return true;
  if (spec.sku === 'EFV-620D-1A2V' && /CASIO\s+EDIFICE/i.test(String(product?.nome || ''))) return true;
  return false;
}

function runAffectedProductRelaunch() {
  const meta = readJson(ACCOUNT_RESET, {});
  if (meta && meta[MARKER]) return false;

  let products = readJson(PRODUCTS, []);
  if (!Array.isArray(products)) return false;

  const recreated = [];
  const relaunchedSkus = [];

  for (const spec of RELAUNCH) {
    const found = products.filter(product => matches(product, spec));
    if (!found.length) continue;

    // Remove completamente o cadastro antigo deste produto.
    products = products.filter(product => !matches(product, spec));

    // Recria um cadastro limpo, preservando preço, estoque, descrição e o mesmo ID.
    const previous = found[0];
    const clean = {
      ...previous,
      id: Number(previous.id),
      nome: spec.nome || previous.nome,
      marca: spec.marca || previous.marca,
      categoria: 'Relógios',
      sku: spec.sku,
      fotos: [...spec.fotos],
      ativo: true
    };
    delete clean.foto;
    recreated.push(clean);
    relaunchedSkus.push(spec.sku);
  }

  if (!recreated.length) return false;

  const next = products.concat(recreated).sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
  writeJson(PRODUCTS, next);
  writeJson(ACCOUNT_RESET, {
    ...(meta && typeof meta === 'object' ? meta : {}),
    [MARKER]: true,
    affected_products_relaunched_at: new Date().toISOString(),
    affected_products_relaunched_skus: relaunchedSkus
  });

  console.log(`Produtos apagados e relançados com cadastro limpo: ${relaunchedSkus.join(', ')}`);
  return true;
}

module.exports = { runAffectedProductRelaunch };
