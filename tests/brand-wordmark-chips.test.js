const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('catálogo usa logos/wordmarks para as cinco marcas com fallback de texto', () => {
  const js = read('script.js');
  for (const brand of ['technos','casio','g-shock','citizen','orient']) {
    assert.match(js, new RegExp(`'${brand}'\\s*:\\s*\\{`), brand);
  }
  assert.match(js, /const BRAND_STYLES = Object\.freeze/);
  assert.match(js, /function renderBrandChip\(marca\)/);
  assert.match(js, /brand-chip brand-chip-logo brand-chip--\$\{brand\.slug\}/);
  assert.match(js, /brand-chip-logo__image/);
  assert.match(js, /brand-chip-fallback/);
  assert.match(js, /Technos_logo\.png/);
  assert.match(js, /Casio_logo\.svg/);
  assert.match(js, /brand-gshock\.svg/);
  assert.match(js, /Citizen_logo\.svg/);
  assert.match(js, /brand-orient\.svg/);
});

test('tags de marca têm recipiente uniforme e adaptação mobile/dark', () => {
  const css = read('public-ui-polish.css');
  assert.match(css, /\.brand-chip-logo\{[\s\S]*width:96px;[\s\S]*height:34px;/);
  assert.match(css, /\.brand-chip-logo::before\{[\s\S]*width:2px;[\s\S]*background:var\(--red\);/);
  assert.match(css, /\.brand-chip-logo__image\{[\s\S]*max-width:76px;[\s\S]*max-height:17px;/);
  assert.match(css, /@media\(max-width:640px\)[\s\S]*width:90px;[\s\S]*height:32px;/);
  assert.match(css, /html\.reloja-dark[\s\S]*\.brand-chip-logo\{[\s\S]*background:#f7f7f5;/);
  assert.doesNotMatch(css, /font-family:"Russo One"/);
  assert.doesNotMatch(css, /font-family:"Montserrat"/);
});

test('página de produtos remove fontes extras usadas só para imitar logotipos', () => {
  const html = read('produtos.html');
  assert.doesNotMatch(html, /family=Russo\+One/);
  assert.doesNotMatch(html, /family=Montserrat/);
  assert.match(html, /public-ui-polish\.css\?v=20260929-brand-logos-3/);
  assert.match(html, /script\.js\?v=20260929-brand-logos-2/);
});
