const fs = require('fs');
const path = require('path');

const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PRODUCTS = path.join(DATA, 'products.json');
const DETAILS = path.join(DATA, 'product-details.json');

const WARRANTY_TEXT = '12 meses';
const PACKAGE_CONTENTS_TEXT = 'Relógio, manual de instruções e certificado de garantia.';

const COLORS_BY_SKU = Object.freeze({
  'F-91W-1': 'Preto',
  'A168WA-1': 'Prata / preto',
  'AE-1200WH-1AV': 'Preto',
  'A171WE-1A': 'Prata / preto',
  'W-218H-1AV': 'Preto',
  'F-105W-1A': 'Preto',
  'W-800H-1AV': 'Preto',
  'AE-1500WH-1AV': 'Preto',
  'MTP-VD01D-1EV': 'Prata / preto',
  'MDV-107-1A1V': 'Preto',
  'MTD-135D-3AV': 'Prata / verde',
  'MTP-V002G-1B': 'Dourado / preto',
  'MDV-107-1A3V': 'Preto / azul',
  'MDV-107-1A2V': 'Preto / verde',
  'EFV-620D-1A4V': 'Prata / preto / vermelho',
  'EFV-540D-1A2V': 'Prata / preto / azul',
  'EFV-540D-1AV': 'Prata / preto',
  'EFV-570D-2AV': 'Prata / azul',
  'LTP-V005L-7B': 'Prata / branco',
  'LTP-V005L-1B': 'Prata / preto',
  'LTP-V005GL-1B': 'Dourado / preto',
  'LTP-V005GL-7B': 'Dourado / branco',
  'LTP-V002GL-7B': 'Dourado / branco',
  'LTP-V002GL-7B2': 'Dourado / branco',
  'LTP-V002GL-1B': 'Dourado / preto',
  'LTP-V002GL-9B': 'Dourado',
  'LTP-V006D-1B': 'Prata / preto',
  'LTP-V006D-7B': 'Prata / branco',
  'LTP-V002D-1B': 'Prata / preto',
  'LTP-V002D-7B': 'Prata / branco',
  'LTP-V005D-1B': 'Prata / preto',
  'LTP-V005D-7B': 'Prata / branco',
  'LTP-V001D-1B': 'Prata / preto',
  'LTP-V001D-7B': 'Prata / branco',
  'W-217H-1AV': 'Preto',
  'CA-53WF-1B': 'Preto',
  'CA-53WF-4B': 'Rosa',
  'CA-53WF-3B': 'Verde',
  'CA-53WF-2B': 'Azul',
  'DBC-32-1A': 'Preto',
  'MRW-210H-5AV': 'Preto / marrom',
  'DB-360-1A': 'Prata / preto',
  'DB-36-1AV': 'Preto',
  'DB-36-9AV': 'Preto / dourado',
  'W-219H-1AV': 'Preto',
  'W-219H-8BV': 'Cinza / preto',
  'W-219H-4AV': 'Vermelho / preto',
  'W-219H-2A2V': 'Azul / preto',
  'DBC-32D-1A': 'Prata / preto',
  'F-91WM-1B': 'Preto',
  'F-91WM-3A': 'Verde',
  'F-91WM-2A': 'Azul',
  'F-94WA-8': 'Cinza / preto',
  'LA-20WH-1A': 'Preto',
  'LA-20WH-4A': 'Rosa',
  'LA-20WH-1C': 'Preto',
  'LA680WA-1': 'Prata / preto',
  'LA680WGA-1': 'Dourado / preto',
  'MW-240-1B2V': 'Preto',
  'MW-240-1E2V': 'Preto',
  'MW-240-1EV': 'Preto',
  'MW-240-2BV': 'Azul / preto',
  'MW-240-3BV': 'Verde / preto',
  'MW-240-4BV': 'Vermelho / preto',
  'MW-240-7BV': 'Branco / preto',
  'MW-240-7EV': 'Branco / preto',
  'W-218H-4B2V': 'Vermelho / preto',
  'W-96H-1AV': 'Preto',
  'GA-B2100-1A': 'Preto',
  'GA-700-1B': 'Preto',
  'DW-6900UB-9': 'Preto / amarelo',
  'G-5600UE-1': 'Preto',
  'GW-9400-1': 'Preto / vermelho',
  'GBD-200-1': 'Preto',
  'GA-110-1B': 'Preto',
  'GA-2200M-1A': 'Preto',
  'GM-2100-1A': 'Prata / preto',
  'GX-56BB-1': 'Preto',
  'GG-1000-1A3': 'Preto / verde',
  'GW-9500-3': 'Verde / preto',
  'GD-100-1A': 'Preto',
  'GX-56UBB-1': 'Preto',
  '2115TWT-1K': 'Bicolor / prata',
  '2035LWF-4P': 'Preto / dourado',
  '2115UL-4B': 'Dourado / branco'
});

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function isVisibleWatch(product) {
  return product?.ativo !== false && normalize(product?.categoria).includes('relogio');
}

function completeLaunchCatalogMetadata() {
  const products = readJson(PRODUCTS, []);
  if (!Array.isArray(products)) throw new Error('products.json inválido ao completar o catálogo.');

  const rawDetails = readJson(DETAILS, {});
  const details = rawDetails && typeof rawDetails === 'object' && !Array.isArray(rawDetails) ? rawDetails : {};
  const updatedAt = new Date().toISOString();

  let warrantyUpdated = 0;
  let packageUpdated = 0;
  let colorUpdated = 0;

  for (const product of products) {
    if (!isVisibleWatch(product)) continue;

    const key = String(Number(product.id));
    const current = details[key] && typeof details[key] === 'object' ? details[key] : {};
    const next = { ...current };
    let touched = false;

    if (String(next.garantia || '').trim() !== WARRANTY_TEXT) {
      next.garantia = WARRANTY_TEXT;
      warrantyUpdated += 1;
      touched = true;
    }

    if (String(next.conteudo_embalagem || '').trim() !== PACKAGE_CONTENTS_TEXT) {
      next.conteudo_embalagem = PACKAGE_CONTENTS_TEXT;
      packageUpdated += 1;
      touched = true;
    }

    if (!String(next.cor || '').trim()) {
      const sku = String(product.sku || '').trim().toUpperCase();
      const color = COLORS_BY_SKU[sku];
      if (color) {
        next.cor = color;
        colorUpdated += 1;
        touched = true;
      }
    }

    if (touched) {
      next.updated_at = updatedAt;
      details[key] = next;
    }
  }

  if (!warrantyUpdated && !packageUpdated && !colorUpdated) return false;

  writeJson(DETAILS, details);
  console.log('Catálogo de lançamento padronizado.', {
    garantias_padronizadas: warrantyUpdated,
    conteudos_embalagem_padronizados: packageUpdated,
    cores_preenchidas: colorUpdated,
    garantia_padrao: WARRANTY_TEXT,
    conteudo_padrao: PACKAGE_CONTENTS_TEXT
  });
  return true;
}

module.exports = {
  COLORS_BY_SKU,
  WARRANTY_TEXT,
  PACKAGE_CONTENTS_TEXT,
  completeLaunchCatalogMetadata
};
