const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('contato usa três cards escuros separados e responsivos', () => {
  const css = read('home-redesign.css');
  const html = read('index.html');

  assert.match(css, /\.section-black \.store-grid\{[\s\S]*gap:clamp\(10px, 1\.4vw, 16px\);[\s\S]*background:transparent;[\s\S]*border:0;/);
  assert.match(css, /\.section-black \.store-cell\{[\s\S]*border:1px solid rgba\(255,255,255,\.16\);[\s\S]*border-radius:10px;[\s\S]*box-shadow:/);
  assert.match(css, /\.section-black \.store-cell::before\{[\s\S]*background:var\(--red\);/);
  assert.match(css, /\.section-black \.store-cell:hover,[\s\S]*transform:translateY\(-2px\)/);
  assert.match(css, /@media \(max-width:900px\)[\s\S]*\.section-black \.store-grid\{ gap:12px; \}/);

  const cards = html.match(/<div class="store-cell">[\s\S]*?<\/div>/g) || [];
  assert.equal(cards.length, 3);
});

test('contato preserva textos, links e acessibilidade de movimento reduzido', () => {
  const css = read('home-redesign.css');
  const html = read('index.html');

  assert.match(html, /Loja física/);
  assert.match(html, /Quando estamos abertos/);
  assert.match(html, /Fale com a equipe/);
  assert.match(html, /Conversar pelo WhatsApp/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
});
