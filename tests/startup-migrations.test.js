const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('startup fica focado em orquestração e delega migrações históricas', () => {
  const startup = read('startup.js');
  const migrations = read('startup-migrations.js');

  assert.match(startup, /require\('\.\/startup-migrations'\)/);
  assert.match(startup, /await runStartupMigrations\(\)/);
  assert.doesNotMatch(startup, /PREEXISTING_HIDDEN|zero_all_product_stock_2026_08_26|clear-test-accounts-2026-08-20/);

  assert.match(migrations, /runProductDataMigrations\(\)/);
  assert.match(migrations, /correctImportedCatalogReleaseOnce\(\)/);
  assert.match(migrations, /completeLaunchCatalogMetadata\(\)/);
  assert.match(migrations, /await zeroAllProductStockOnce\(\)/);
  assert.match(migrations, /await clearTestAccountsOnce\(\)/);
  assert.match(migrations, /installBrandCarouselPresetOnce\(\)/);
});

test('migração antiga de fotos não permanece como módulo órfão', () => {
  assert.equal(fs.existsSync(path.join(root, 'product-photo-migrations.js')), false);
});
