const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('destaque do título segue a identidade vermelha sem marca-texto amarelo', () => {
  const html = read('index.html');
  const css = read('home-redesign.css');
  assert.doesNotMatch(html, /<mark>/);
  assert.match(html, /<span class="accent-word">confiáveis<\/span>/);
  assert.match(css, /\.home-intro \.accent-word\{[\s\S]*background:none;[\s\S]*box-shadow:inset 0 -\.16em 0 var\(--red\)/);
});

test('relógio fica próximo do texto sem ser empurrado para o fim da coluna', () => {
  const css = read('home-redesign.css');
  const signature = css.match(/body\.page-home \.home-intro-signature\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(signature, /margin-top:clamp\(24px, 3\.2vw, 42px\)/);
  assert.doesNotMatch(signature, /margin-top:auto/);
});

test('Home organiza marcas, experiência e contato em uma sequência completa', () => {
  const html = read('index.html');
  assert.match(html, /Seleção oficial[\s\S]*Escolha pela marca que combina com você/);
  assert.match(html, /Experiência e cuidado[\s\S]*class="service-list"/);
  assert.match(html, /Loja física e atendimento[\s\S]*Ver informações da loja[\s\S]*Conversar pelo WhatsApp/);
  assert.ok(html.indexOf('id="marcas"') < html.indexOf('id="sobre-teaser"'));
  assert.ok(html.indexOf('id="sobre-teaser"') < html.indexOf('id="contato-home"'));
});

test('reorganização mantém estados responsivos e não altera outras páginas', () => {
  const css = read('home-redesign.css');
  assert.match(css, /^body\.page-home\{/m);
  assert.match(css, /@media \(max-width:820px\)[\s\S]*grid-template-areas:"copy" "media"/);
  assert.match(css, /@media \(max-width:620px\)[\s\S]*\.home-intro-signature\{ grid-template-columns:1fr; \}/);
  assert.match(css, /@media \(max-width:980px\)[\s\S]*#sobre-teaser \.about-grid\{ grid-template-columns:1fr/);
});
