const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Home usa um único eixo horizontal no cabeçalho, seções e rodapé', () => {
  const css = read('home-redesign.css');
  assert.match(css, /body\.page-home \.nav\{ padding-inline:var\(--home-gutter\); \}/);
  assert.match(css, /body\.page-home \.section \.frame,[\s\S]*body\.page-home footer \.frame\{[\s\S]*display:block;[\s\S]*padding-inline:var\(--home-gutter\);/);
  assert.match(css, /body\.page-home \.section-content\{ padding-right:0; \}/);
  assert.match(css, /body\.page-home footer \.frame > div:last-child\{[\s\S]*padding:clamp\(40px, 5vw, 56px\) 0/);
});

test('régua lateral permanece decorativa sem deslocar o conteúdo', () => {
  const css = read('home-redesign.css');
  assert.match(css, /body\.page-home \.section \.rail,[\s\S]*body\.page-home footer \.rail\{[\s\S]*position:absolute;[\s\S]*width:calc\(var\(--home-gutter\) - 14px\);/);
  assert.match(css, /@media \(min-width:901px\)\{[\s\S]*#sobre-teaser \.rail\{ display:block; \}/);
});

test('arquivo alinhado recebe versão nova para evitar cache antigo', () => {
  const html = read('index.html');
  assert.match(html, /home-redesign\.css\?v=20260926-global-alignment-1/);
});
