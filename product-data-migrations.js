const fs = require('fs');
const path = require('path');

const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PRODUCTS = path.join(DATA, 'products.json');
const DETAILS = path.join(DATA, 'product-details.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function migrateF91W() {
  const products = readJson(PRODUCTS, []);
  if (!Array.isArray(products)) return false;

  const index = products.findIndex(p =>
    Number(p?.id) === 6 ||
    String(p?.sku || '').toUpperCase() === 'CAS-F91W' ||
    /F\s*-?\s*91W/i.test(String(p?.nome || ''))
  );
  if (index < 0) return false;

  const current = products[index] || {};
  // A migração é propositalmente de uma única vez: depois que o SKU oficial
  // F-91W-1 estiver salvo, futuros ajustes feitos pelo painel não serão sobrescritos.
  if (String(current.sku || '').trim().toUpperCase() === 'F-91W-1') return false;

  products[index] = {
    ...current,
    nome: 'Casio F-91W-1',
    marca: 'Casio',
    categoria: 'Relógios',
    preco: 250,
    sku: 'F-91W-1',
    desc: 'Um dos digitais mais reconhecidos da Casio: fino, leve e prático para o uso diário, com cronômetro de 1/100 de segundo, alarme diário, sinal horário, luz de LED, calendário e bateria de longa duração.',
    fotos: [
      'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/F/F9/F91/F-91W-1/assets/F-91W-1_Seq1.png.transform/main-visual-sp/image.png',
      'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/F/F9/F91/F-91W-1/assets/F-91W-1_kv.jpg.transform/main-visual-sp/image.jpg',
      'https://www.casio.com/content/dam/casio/product-info/locales/br/pt-br/timepiece/product/watch/F/F9/F91/F-91W-1/assets/F-91W-1_wrist.jpg.transform/main-visual-sp/image.jpg'
    ],
    ativo: current.ativo !== false
  };
  writeJson(PRODUCTS, products);

  const details = readJson(DETAILS, {});
  const map = details && typeof details === 'object' && !Array.isArray(details) ? details : {};
  map[String(products[index].id)] = {
    ...(map[String(products[index].id)] || {}),
    movimento: 'Digital — alimentação por bateria CR2016',
    caixa_material: 'Resina',
    pulseira_material: 'Resina',
    cor: 'Preto',
    diametro: '38,2 × 35,2 × 8,5 mm (C × L × A)',
    resistencia_agua: 'Resistente à água',
    vidro: 'Vidro de resina',
    garantia: '',
    conteudo_embalagem: '',
    updated_at: new Date().toISOString()
  };
  writeJson(DETAILS, map);

  console.log('Migração aplicada: Casio F-91W-1 atualizado para R$ 250,00 com ficha técnica e fotos oficiais.');
  return true;
}

function runProductDataMigrations() {
  migrateF91W();
}

module.exports = { runProductDataMigrations };
