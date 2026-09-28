const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('catálogo usa etiquetas tipográficas para as cinco marcas sem imagens externas', () => {
  const js = read('script.js');
  for (const brand of ['technos','casio','g-shock','citizen','orient']) {
    assert.match(js, new RegExp(`'${brand}'\\s*:\\s*\\{`), brand);
  }
  assert.match(js, /const BRAND_STYLES = Object\.freeze/);
  assert.match(js, /function renderBrandChip\(marca\)/);
  assert.match(js, /brand-chip-text brand-chip--\$\{brand\.slug\}/);
  assert.doesNotMatch(js, /upload\.wikimedia\.org/);
  assert.doesNotMatch(js, /brand-chip-logo/);
});

test('cada marca recebe tipografia e detalhe de cor próprios', () => {
  const css = read('public-ui-polish.css');
  assert.match(css, /\.brand-chip--technos[\s\S]*#c4212b/);
  assert.match(css, /\.brand-chip--casio[\s\S]*#003296/);
  assert.match(css, /\.brand-chip--g-shock[\s\S]*#e5232a/);
  assert.match(css, /\.brand-chip--citizen\{[\s\S]*#143c72[\s\S]*color:#111;/);
  assert.match(css, /\.brand-chip--citizen \.brand-chip-name\{[\s\S]*font-family:"Times New Roman",Times,serif;[\s\S]*font-size:\.84rem;/);
  assert.match(css, /\.brand-chip--orient\{[\s\S]*color:#2b1813;/);
  assert.match(css, /font-family:"Russo One"/);
  assert.match(css, /font-family:"Times New Roman",Times,serif/);
  assert.match(css, /\.brand-chip--orient \.brand-chip-name\{[\s\S]*-webkit-text-stroke:\.18px currentColor;/);
  assert.match(css, /\.brand-chip--orient::before\{[\s\S]*display:block;[\s\S]*background:#8d1328;/);
  assert.match(css, /\.brand-chip--orient::after\{[\s\S]*display:none;/);
});

test('página de produtos carrega fontes e versões novas das etiquetas', () => {
  const html = read('produtos.html');
  assert.match(html, /family=Russo\+One/);
  assert.match(html, /public-ui-polish\.css\?v=20260928-orient-weight-1/);
  assert.match(html, /script\.js\?v=20260928-product-names-1/);
});
