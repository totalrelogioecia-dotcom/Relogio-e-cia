const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('abertura reúne carrossel, mensagem comercial, relógio e números da loja', () => {
  const html = read('index.html');
  assert.match(html, /class="home-selection home-intro"/);
  assert.match(html, /Relógios de marcas <mark>confiáveis<\/mark>, prontos para entrega\./);
  assert.match(html, /class="home-intro-media"[\s\S]*id="home-carousel"/);
  assert.match(html, /class="home-intro-signature"[\s\S]*id="analog-clock-brasilia"[\s\S]*class="hero-stats"/);
  assert.ok(html.indexOf('id="home-selection"') < html.indexOf('id="marcas"'));
});

test('reorganização preserva carrossel arrastável, destinos e relógio dinâmico', () => {
  const html = read('index.html');
  assert.match(html, /id="home-carousel-stage"/);
  assert.match(html, /id="home-carousel-controls" hidden/);
  assert.match(html, /home-carousel-client\.js\?v=20260919-drag-6/);
  assert.match(html, /href="produtos\.html" class="btn btn-primary"/);
  assert.match(html, /href="sobre\.html" class="btn btn-outline"/);
  assert.match(html, /id="stopwatch-data"/);
});

test('layout segue duas colunas no desktop e uma coluna no celular', () => {
  const css = read('home-redesign.css');
  const html = read('index.html');
  assert.match(css, /grid-template-areas:"media copy"/);
  assert.match(css, /grid-template-columns:minmax\(0, 1\.48fr\) minmax\(360px, \.96fr\)/);
  assert.match(css, /@media \(max-width:820px\)[\s\S]*grid-template-areas:"copy" "media"/);
  assert.match(css, /@media \(max-width:620px\)[\s\S]*\.home-carousel-stage\{ height:min\(82vw, 410px\); \}/);
  assert.match(html, /home-redesign\.css\?v=20260924-hero-reorg-1/);
});

test('faixa inferior mantém somente os três benefícios do rascunho', () => {
  const html = read('index.html');
  const strip = html.match(/<div class="value-strip">([\s\S]*?)<\/div>/)?.[1] || '';
  assert.equal((strip.match(/<span>/g) || []).length, 3);
  assert.match(strip, /Produtos originais com nota fiscal/);
  assert.match(strip, /Garantia de fábrica/);
  assert.match(strip, /Frete para todo o Brasil/);
});
