const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('abertura reúne carrossel, mensagem comercial, relógio e números da loja', () => {
  const html = read('index.html');
  assert.match(html, /class="home-selection home-intro"/);
  assert.match(html, /Relógios de marcas <span class="accent-word">confiáveis<\/span>, prontos para entrega\./);
  assert.match(html, /class="home-intro-media"[\s\S]*id="home-carousel"/);
  assert.match(html, /class="home-intro-signature"[\s\S]*id="analog-clock-brasilia"[\s\S]*class="hero-stats"/);
  assert.ok(html.indexOf('id="home-selection"') < html.indexOf('id="marcas"'));
});

test('reorganização preserva carrossel arrastável, destinos e relógio dinâmico', () => {
  const html = read('index.html');
  assert.match(html, /id="home-carousel-stage"/);
  assert.match(html, /id="home-carousel-controls" hidden/);
  assert.doesNotMatch(html, /home-carousel-hint|Arraste ou use as setas/);
  assert.match(html, /home-carousel-client\.js\?v=20260924-product-cta-1/);
  assert.match(html, /href="produtos\.html\?marca=Technos" class="brand-row"/);
  assert.match(html, /href="sobre\.html" class="home-text-link"/);
  assert.match(html, /id="stopwatch-data"/);
});

test('layout segue duas colunas no desktop e uma coluna no celular', () => {
  const css = read('home-redesign.css');
  const html = read('index.html');
  assert.match(css, /grid-template-areas:"media copy"/);
  assert.match(css, /grid-template-columns:minmax\(0, 1\.48fr\) minmax\(360px, \.96fr\)/);
  assert.match(css, /gap:clamp\(38px, 4\.8vw, 70px\)/);
  assert.match(css, /\.value-strip\{[\s\S]*margin-top:clamp\(24px, 2\.4vw, 32px\)/);
  assert.match(css, /\.home-carousel-stage\{\s*height:clamp\(380px, 32vw, 480px\);/);
  assert.match(css, /@media \(min-width:821px\)[\s\S]*object-position:64% center/);
  assert.match(css, /@media \(min-width:821px\)[\s\S]*\.home-carousel-copy\{\s*max-width:48%/);
  assert.match(css, /@media \(max-width:820px\)[\s\S]*grid-template-areas:"copy" "media"/);
  assert.match(css, /@media \(max-width:620px\)[\s\S]*\.home-carousel-stage\{ height:min\(82vw, 410px\); \}/);
  assert.match(css, /\.home-intro \.home-carousel\{ flex:0 0 auto; \}/);
  assert.match(html, /home-redesign\.css\?v=20260926-divider-lines-1/);
});

test('destaque principal recebe moldura suave aprovada', () => {
  const css = read('home-redesign.css');
  assert.match(css, /\.home-intro-grid\{[\s\S]*border:1px solid var\(--line\);[\s\S]*border-radius:16px;[\s\S]*box-shadow:0 18px 48px rgba\(17,17,17,\.10\)/);
  assert.match(css, /\.home-intro-grid::before\{[\s\S]*background:var\(--red\);/);
  assert.match(css, /@media \(max-width:820px\)[\s\S]*border-radius:12px/);
});

test('faixa inferior mantém somente os três benefícios do rascunho', () => {
  const html = read('index.html');
  const strip = html.match(/<div class="value-strip">([\s\S]*?)<\/div>/)?.[1] || '';
  assert.equal((strip.match(/<span>/g) || []).length, 3);
  assert.match(strip, /Produtos originais com nota fiscal/);
  assert.match(strip, /Garantia de fábrica/);
  assert.match(strip, /Frete para todo o Brasil/);
});
