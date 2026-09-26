const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('benefícios equilibram as três colunas e voltam à esquerda no celular', () => {
  const css = read('home-redesign.css');
  assert.match(css, /\.value-strip span:nth-child\(2\)\{ text-align:center; \}/);
  assert.match(css, /\.value-strip span:nth-child\(3\)\{ text-align:right; \}/);
  assert.match(css, /@media \(max-width:620px\)[\s\S]*\.value-strip span:nth-child\(n\)\{ text-align:left; \}/);
});

test('três cartões de contato usam o mesmo recuo e a mesma linha de ação', () => {
  const css = read('home-redesign.css');
  const html = read('index.html');
  assert.match(css, /\.section-black \.store-cell\{[\s\S]*padding:clamp\(24px, 2\.6vw, 32px\);/);
  assert.match(css, /\.section-black \.store-cell p\{[\s\S]*min-height:calc\(2 \* 1\.65em\)/);
  const cards = html.match(/<div class="store-cell">[\s\S]*?<\/div>/g) || [];
  assert.equal(cards.length, 3);
  cards.forEach(card => assert.match(card, /<a href=/));
  assert.match(html, /Ver horários da loja/);
});

test('CSS equilibrado recebe uma versão nova contra cache antigo', () => {
  const html = read('index.html');
  assert.match(html, /home-redesign\.css\?v=20260926-divider-lines-1/);
});
