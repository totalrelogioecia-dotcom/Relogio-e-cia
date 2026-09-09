const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadMigration(tempDir) {
  const previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = tempDir;
  const modulePath = require.resolve('../catalog-completion-migration');
  delete require.cache[modulePath];
  const migration = require('../catalog-completion-migration');
  return {
    migration,
    restore() {
      delete require.cache[modulePath];
      if (previousDataDir === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = previousDataDir;
    }
  };
}

test('mapa de cores cobre os 85 SKUs que estavam sem cor no catálogo', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-catalog-map-'));
  const { migration, restore } = loadMigration(tempDir);
  try {
    assert.equal(Object.keys(migration.COLORS_BY_SKU).length, 85);
    assert.ok(Object.values(migration.COLORS_BY_SKU).every(value => String(value).trim()));
    assert.equal(migration.COLORS_BY_SKU['F-91W-1'], 'Preto');
    assert.equal(migration.COLORS_BY_SKU['GA-B2100-1A'], 'Preto');
    assert.equal(migration.COLORS_BY_SKU['2035LWF-4P'], 'Preto / dourado');
  } finally {
    restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('preenche somente campos ausentes sem alterar produto ou metadados já informados', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-catalog-completion-'));
  const productsFile = path.join(tempDir, 'products.json');
  const detailsFile = path.join(tempDir, 'product-details.json');

  const products = [
    {
      id: 68,
      nome: 'Casio F-91W-1',
      marca: 'Casio',
      categoria: 'Relógios',
      preco: 500,
      sku: 'F-91W-1',
      desc: 'Teste',
      fotos: ['https://example.com/f91w.jpg'],
      estoque: 0,
      ativo: true
    },
    {
      id: 73,
      nome: 'G-Shock GA-B2100-1A',
      marca: 'G-Shock',
      categoria: 'Relógios',
      preco: 999,
      sku: 'GA-B2100-1A',
      desc: 'Teste',
      fotos: ['https://example.com/gshock.jpg'],
      estoque: 0,
      ativo: true
    },
    {
      id: 999,
      nome: 'Produto oculto',
      marca: 'Casio',
      categoria: 'Relógios',
      preco: 123,
      sku: 'F-91W-1',
      desc: 'Oculto',
      fotos: ['https://example.com/hidden.jpg'],
      estoque: 7,
      ativo: false
    }
  ];

  writeJson(productsFile, products);
  writeJson(detailsFile, {
    '68': { cor: '', garantia: '', conteudo_embalagem: '' },
    '73': { cor: 'Cor já confirmada', garantia: '6 meses', conteudo_embalagem: 'Conteúdo específico' },
    '999': { cor: '', garantia: '', conteudo_embalagem: '' }
  });

  const productsBefore = fs.readFileSync(productsFile, 'utf8');
  const { migration, restore } = loadMigration(tempDir);

  try {
    assert.equal(migration.completeLaunchCatalogMetadata(), true);

    const details = readJson(detailsFile);
    assert.equal(details['68'].cor, 'Preto');
    assert.equal(details['68'].garantia, '1 ano');
    assert.equal(details['68'].conteudo_embalagem, 'Relógio + manual + certificado de garantia');

    assert.equal(details['73'].cor, 'Cor já confirmada');
    assert.equal(details['73'].garantia, '6 meses');
    assert.equal(details['73'].conteudo_embalagem, 'Conteúdo específico');

    assert.equal(details['999'].cor, '');
    assert.equal(details['999'].garantia, '');
    assert.equal(details['999'].conteudo_embalagem, '');

    assert.equal(fs.readFileSync(productsFile, 'utf8'), productsBefore);
    assert.deepEqual(readJson(productsFile), products);
  } finally {
    restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('segunda execução é idempotente quando o catálogo já está completo', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-catalog-idempotent-'));
  writeJson(path.join(tempDir, 'products.json'), [{
    id: 68,
    nome: 'Casio F-91W-1',
    marca: 'Casio',
    categoria: 'Relógios',
    preco: 500,
    sku: 'F-91W-1',
    desc: 'Teste',
    fotos: ['https://example.com/f91w.jpg'],
    estoque: 0,
    ativo: true
  }]);
  writeJson(path.join(tempDir, 'product-details.json'), {
    '68': {
      cor: 'Preto',
      garantia: '1 ano',
      conteudo_embalagem: 'Relógio + manual + certificado de garantia'
    }
  });

  const { migration, restore } = loadMigration(tempDir);
  try {
    assert.equal(migration.completeLaunchCatalogMetadata(), false);
  } finally {
    restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
