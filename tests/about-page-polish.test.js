const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('página Sobre carrega refinamento visual exclusivo', () => {
  const html = read('sobre.html');
  assert.match(html, /<body class="page-about">/);
  assert.match(html, /about-redesign\.css\?v=20260926-about-polish-1/);
});

test('foto da loja e história seguem o mesmo acabamento visual da Home', () => {
  const css = read('about-redesign.css');
  assert.match(css, /\.about-hero-layout\{[\s\S]*border:1px solid var\(--line\);[\s\S]*border-radius:16px;[\s\S]*box-shadow:/);
  assert.match(css, /\.about-hero-layout::before\{[\s\S]*background:var\(--red\);/);
  assert.match(css, /\.about-hero-card\{[\s\S]*border-radius:12px;[\s\S]*box-shadow:/);
  assert.match(css, /\.stat-block\{[\s\S]*border:1px solid var\(--line\);[\s\S]*border-radius:14px;[\s\S]*box-shadow:/);
  assert.match(css, /\.stat-block::before\{[\s\S]*background:var\(--red\);/);
});

test('faixa da loja física usa cards separados e rodapé mantém eixo padronizado', () => {
  const css = read('about-redesign.css');
  const html = read('sobre.html');
  assert.match(css, /\.section-black \.store-grid\{[\s\S]*gap:clamp\(10px,1\.4vw,16px\);[\s\S]*background:transparent;[\s\S]*border:0;/);
  assert.match(css, /\.section-black \.store-cell\{[\s\S]*border-radius:10px;[\s\S]*box-shadow:/);
  assert.match(css, /footer \.footer-grid,[\s\S]*footer \.footer-bottom\{[\s\S]*padding-right:0;/);
  assert.equal((html.match(/<div class="store-cell">/g) || []).length, 3);
});

test('refinamento respeita responsividade e movimento reduzido', () => {
  const css = read('about-redesign.css');
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css, /@media \(max-width:980px\)[\s\S]*\.about-hero-layout\{[\s\S]*grid-template-columns:1fr;/);
  assert.match(css, /@media \(max-width:640px\)[\s\S]*\.about-hero-layout\{[\s\S]*border-radius:12px;/);
});
