const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('card de 20+ anos recebe acabamento visual premium', () => {
  const css = read('home-redesign.css');
  const html = read('index.html');

  assert.match(css, /#sobre-teaser \.stat-block\{[\s\S]*border:1px solid var\(--line\);[\s\S]*border-radius:12px;[\s\S]*box-shadow:/);
  assert.match(css, /#sobre-teaser \.stat-block::before\{[\s\S]*background:var\(--red\);/);
  assert.match(css, /#sobre-teaser \.stat-block:hover,[\s\S]*transform:translateY\(-2px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(html, /20\+/);
  assert.match(html, /Anos no ramo de relojoaria/);
});

test('card sobre preserva os três diferenciais originais', () => {
  const html = read('index.html');
  assert.match(html, /Produtos originais/);
  assert.match(html, /Assistência técnica/);
  assert.match(html, /Atendimento presencial e online/);
});
