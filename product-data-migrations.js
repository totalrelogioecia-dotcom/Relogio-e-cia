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

function migrateOfficialWatchSpecs() {
  const products = readJson(PRODUCTS, []);
  if (!Array.isArray(products)) return false;
  const rawDetails = readJson(DETAILS, {});
  const details = rawDetails && typeof rawDetails === 'object' && !Array.isArray(rawDetails) ? rawDetails : {};

  const specs = {
    'GPR-H1000-9': { movimento:'Digital com GPS, Bluetooth, sensores e carregamento por cabo + energia solar', caixa_material:'Resina / resina de base biológica', pulseira_material:'Resina de base biológica', cor:'Amarelo / preto', diametro:'60,6 × 53,2 × 20,3 mm (C × L × A) · 92 g', resistencia_agua:'200 metros (20 bar)', vidro:'Vidro mineral' },
    'DW-5600UBB-1': { movimento:'Digital — bateria CR2016, autonomia aproximada de 5 anos', caixa_material:'Resina', pulseira_material:'Resina', cor:'Preto', diametro:'48,9 × 42,8 × 13,4 mm (C × L × A) · 53 g', resistencia_agua:'200 metros (20 bar)', vidro:'Vidro mineral' },
    'GA-2100-1A': { movimento:'Digital-analógico — 2 baterias SR726W, autonomia aproximada de 3 anos', caixa_material:'Carbono / resina — Carbon Core Guard', pulseira_material:'Resina', cor:'Preto', diametro:'48,5 × 45,4 × 11,8 mm (C × L × A) · 51 g', resistencia_agua:'200 metros (20 bar)', vidro:'Vidro mineral' },
    'GA-2100-1A1': { movimento:'Digital-analógico — 2 baterias SR726W, autonomia aproximada de 3 anos', caixa_material:'Carbono / resina — Carbon Core Guard', pulseira_material:'Resina', cor:'Preto monocromático', diametro:'48,5 × 45,4 × 11,8 mm (C × L × A) · 51 g', resistencia_agua:'200 metros (20 bar)', vidro:'Vidro mineral' },
    'DW-5600UHR-1': { movimento:'Digital — bateria CR2016, autonomia aproximada de 5 anos', caixa_material:'Resina', pulseira_material:'Resina', cor:'Preto / vermelho', diametro:'48,9 × 42,8 × 13,4 mm (C × L × A)', resistencia_agua:'200 metros (20 bar)', vidro:'Vidro mineral' },
    'DW-5600RL-1': { movimento:'Digital — bateria CR2016, autonomia aproximada de 5 anos', caixa_material:'Resina', pulseira_material:'Resina', cor:'Preto / vermelho', diametro:'48,9 × 42,8 × 13,4 mm (C × L × A)', resistencia_agua:'200 metros (20 bar)', vidro:'Vidro mineral' },
    'GA-100-1A4': { movimento:'Digital-analógico — bateria CR1220, autonomia aproximada de 2 anos', caixa_material:'Resina', pulseira_material:'Resina', cor:'Preto com detalhes coloridos', diametro:'55 × 51,2 × 16,9 mm (C × L × A) · 70 g', resistencia_agua:'200 metros (20 bar)', vidro:'Vidro mineral' },
    'GA-100-1A2': { movimento:'Digital-analógico — bateria CR1220, autonomia aproximada de 2 anos', caixa_material:'Resina', pulseira_material:'Resina', cor:'Preto / azul', diametro:'55 × 51,2 × 16,9 mm (C × L × A) · 70 g', resistencia_agua:'200 metros (20 bar)', vidro:'Vidro mineral' },
    'GA-100-1A1': { movimento:'Digital-analógico — bateria CR1220, autonomia aproximada de 2 anos', caixa_material:'Resina', pulseira_material:'Resina', cor:'Preto', diametro:'55 × 51,2 × 16,9 mm (C × L × A) · 70 g', resistencia_agua:'200 metros (20 bar)', vidro:'Vidro mineral' },
    'G-7900-2': { movimento:'Digital — bateria CR2025, autonomia aproximada de 2 anos; gráfico de marés e dados lunares', caixa_material:'Resina', pulseira_material:'Resina', cor:'Azul / preto', diametro:'52,4 × 50 × 17,7 mm (C × L × A) · 68,2 g', resistencia_agua:'200 metros (20 bar)', vidro:'Vidro mineral' },
    'G-7900A-4': { movimento:'Digital — bateria CR2025, autonomia aproximada de 2 anos; gráfico de marés e dados lunares', caixa_material:'Resina', pulseira_material:'Resina', cor:'Vermelho / preto', diametro:'52,4 × 50 × 17,7 mm (C × L × A)', resistencia_agua:'200 metros (20 bar)', vidro:'Vidro mineral' },
    'DW-5600UE-1': { movimento:'Digital — bateria CR2016, autonomia aproximada de 5 anos', caixa_material:'Resina', pulseira_material:'Resina', cor:'Preto', diametro:'48,9 × 42,8 × 13,4 mm (C × L × A) · 52 g', resistencia_agua:'200 metros (20 bar)', vidro:'Vidro mineral' },
    'DW-5750UE-1': { movimento:'Digital — bateria CR2016, autonomia aproximada de 5 anos', caixa_material:'Resina', pulseira_material:'Resina', cor:'Preto', diametro:'48,9 × 45,4 × 14,1 mm (C × L × A) · 52 g', resistencia_agua:'200 metros (20 bar)', vidro:'Vidro mineral' },
    'AQ-230A-1DMQ': { movimento:'Digital-analógico — bateria SR920W, autonomia aproximada de 3 anos', caixa_material:'Resina cromada', pulseira_material:'Aço inoxidável com fecho ajustável', cor:'Prata / preto', diametro:'38,8 × 29,8 × 8,1 mm (C × L × A) · 47 g', resistencia_agua:'Resistente à água', vidro:'Vidro de resina' },
    'AQ-230A-7DMQ': { movimento:'Digital-analógico — bateria SR920W, autonomia aproximada de 3 anos', caixa_material:'Resina cromada', pulseira_material:'Aço inoxidável com fecho ajustável', cor:'Prata', diametro:'38,8 × 29,8 × 8,1 mm (C × L × A) · 47 g', resistencia_agua:'Resistente à água', vidro:'Vidro de resina' },
    'A158WA-1': { movimento:'Digital — bateria CR2016, autonomia aproximada de 7 anos', caixa_material:'Resina cromada', pulseira_material:'Aço inoxidável com fecho ajustável', cor:'Prata', diametro:'36,8 × 33,2 × 8,2 mm (C × L × A) · 46 g', resistencia_agua:'Resistente à água', vidro:'Vidro de resina' },
    'LA680WA-1B': { movimento:'Digital — bateria CR1616, autonomia aproximada de 5 anos', caixa_material:'Resina cromada', pulseira_material:'Aço inoxidável com fecho ajustável', cor:'Prata / preto', diametro:'33,5 × 28,6 × 8,6 mm (C × L × A) · 36 g', resistencia_agua:'Resistente à água', vidro:'Vidro de resina' },
    'LA680WA-7': { movimento:'Digital — bateria CR1616, autonomia aproximada de 5 anos', caixa_material:'Resina cromada', pulseira_material:'Aço inoxidável com fecho ajustável', cor:'Prata', diametro:'33,5 × 28,6 × 8,6 mm (C × L × A) · 36 g', resistencia_agua:'Resistente à água', vidro:'Vidro de resina' },
    'MDV-107D-1A1V': { movimento:'Analógico de quartzo — bateria SR626SW, autonomia aproximada de 3 anos', caixa_material:'Aço inoxidável / alumínio; fundo rosqueado e luneta unidirecional', pulseira_material:'Aço inoxidável com fecho triplo de um toque', cor:'Prata / preto', diametro:'49,5 × 46,3 × 12,1 mm (C × L × A) · 144 g', resistencia_agua:'200 metros (20 bar)', vidro:'Vidro mineral' },
    'MDV-107D-1A3V': { movimento:'Analógico de quartzo — bateria SR626SW, autonomia aproximada de 3 anos', caixa_material:'Aço inoxidável / alumínio; fundo rosqueado e luneta unidirecional', pulseira_material:'Aço inoxidável com fecho triplo de um toque', cor:'Prata / azul', diametro:'49,5 × 46,3 × 12,1 mm (C × L × A) · 144 g', resistencia_agua:'200 metros (20 bar)', vidro:'Vidro mineral' },
    'MDV-107D-1A2V': { movimento:'Analógico de quartzo — bateria SR626SW, autonomia aproximada de 3 anos', caixa_material:'Aço inoxidável / alumínio; fundo rosqueado e luneta unidirecional', pulseira_material:'Aço inoxidável com fecho triplo de um toque', cor:'Prata / verde', diametro:'49,5 × 46,3 × 12,1 mm (C × L × A) · 144 g', resistencia_agua:'200 metros (20 bar)', vidro:'Vidro mineral' },
    'LA670WGA-1': { movimento:'Digital — bateria CR1216, autonomia aproximada de 2 anos', caixa_material:'Resina em tom dourado', pulseira_material:'Aço inoxidável com fecho ajustável', cor:'Dourado / preto', diametro:'30,3 × 24,6 × 7,3 mm (C × L × A) · 27,8 g', resistencia_agua:'Resistente à água', vidro:'Vidro de resina' },
    'LA670WGA-9': { movimento:'Digital — bateria CR1216, autonomia aproximada de 2 anos', caixa_material:'Resina em tom dourado', pulseira_material:'Aço inoxidável com fecho ajustável', cor:'Dourado', diametro:'30,3 × 24,6 × 7,3 mm (C × L × A) · cerca de 28 g', resistencia_agua:'Resistente à água', vidro:'Vidro de resina' },
    'A171WEG-9A': { movimento:'Digital — bateria CR2016, autonomia aproximada de 7 anos', caixa_material:'Resina em tom dourado', pulseira_material:'Aço inoxidável com fecho ajustável e revestimento dourado', cor:'Dourado', diametro:'38,8 × 37,7 × 9,2 mm (C × L × A) · 46 g', resistencia_agua:'Resistente à água', vidro:'Vidro de resina' },
    'B640WB-1A': { movimento:'Digital — bateria CR2016, autonomia aproximada de 3 anos', caixa_material:'Resina', pulseira_material:'Aço inoxidável com fecho ajustável e acabamento preto', cor:'Preto / dourado', diametro:'38,9 × 35 × 9,4 mm (C × L × A) · 49 g', resistencia_agua:'50 metros (5 bar)', vidro:'Vidro de resina' },
    'LA670WA-1': { movimento:'Digital — bateria CR1216, autonomia aproximada de 2 anos', caixa_material:'Resina cromada', pulseira_material:'Aço inoxidável com fecho ajustável', cor:'Prata', diametro:'30,3 × 24,6 × 7,3 mm (C × L × A) · 26 g', resistencia_agua:'Resistente à água', vidro:'Vidro de resina' },
    'B640WC-5A': { movimento:'Digital — bateria CR2016, autonomia aproximada de 3 anos', caixa_material:'Resina', pulseira_material:'Aço inoxidável com fecho ajustável', cor:'Ouro rosé', diametro:'38,9 × 35 × 9,4 mm (C × L × A) · 49 g', resistencia_agua:'50 metros (5 bar)', vidro:'Vidro de resina' },
    'A159WGEA-1': { movimento:'Digital — bateria CR2016, autonomia aproximada de 7 anos', caixa_material:'Resina em tom dourado', pulseira_material:'Aço inoxidável com fecho ajustável', cor:'Dourado / preto', diametro:'36,8 × 33,2 × 8,5 mm (C × L × A) · 44 g', resistencia_agua:'Resistente à água', vidro:'Vidro de resina' },
    'AQ-230GA-9DMQ': { movimento:'Digital-analógico — bateria SR920W, autonomia aproximada de 3 anos', caixa_material:'Resina em tom dourado', pulseira_material:'Aço inoxidável com fecho ajustável', cor:'Dourado', diametro:'38,8 × 29,8 × 8,1 mm (C × L × A) · cerca de 47 g', resistencia_agua:'Resistente à água', vidro:'Vidro de resina' }
  };

  let changed = 0;
  for (const product of products) {
    const sku = String(product?.sku || '').trim().toUpperCase();
    const spec = specs[sku];
    if (!spec) continue;
    const key = String(product.id);
    const current = details[key] && typeof details[key] === 'object' ? details[key] : {};
    const next = { ...current };
    let touched = false;
    for (const [field, value] of Object.entries(spec)) {
      if (!String(next[field] || '').trim()) {
        next[field] = value;
        touched = true;
      }
    }
    if (touched) {
      next.garantia = next.garantia || '';
      next.conteudo_embalagem = next.conteudo_embalagem || '';
      next.updated_at = new Date().toISOString();
      details[key] = next;
      changed++;
    }
  }

  if (!changed) return false;
  writeJson(DETAILS, details);
  console.log(`Migração aplicada: fichas técnicas oficiais preenchidas em ${changed} relógio(s) Casio/G-Shock.`);
  return true;
}

function runProductDataMigrations() {
  migrateF91W();
  migrateOfficialWatchSpecs();
}

module.exports = { runProductDataMigrations };

