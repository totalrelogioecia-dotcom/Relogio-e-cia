const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('seção de marcas recebe moldura suave sem preview lateral', () => {
  const css = read('home-redesign.css');
  const html = read('index.html');

  assert.match(css, /#marcas \.section-content\{[\s\S]*border:1px solid var\(--line\);[\s\S]*border-radius:16px;[\s\S]*box-shadow:/);
  assert.match(css, /#marcas \.section-content::before\{[\s\S]*background:var\(--red\);/);
  assert.match(css, /#marcas \.brand-row:hover::before,[\s\S]*transform:scaleY\(1\)/);
  assert.match(css, /#marcas \.brand-row:hover \.arrow,[\s\S]*transform:translateX\(4px\)/);
  assert.doesNotMatch(html, /brand-preview|preview-da-marca|preview-marca/);
});

test('seção de marcas mantém as cinco linhas clicáveis em largura total', () => {
  const html = read('index.html');
  const rows = html.match(/class="brand-row"/g) || [];
  assert.equal(rows.length, 5);
  assert.match(html, /href="produtos\.html\?marca=Technos"/);
  assert.match(html, /href="produtos\.html\?marca=Casio"/);
  assert.match(html, /href="produtos\.html\?marca=G-Shock"/);
  assert.match(html, /href="produtos\.html\?marca=Citizen"/);
  assert.match(html, /href="produtos\.html\?marca=Orient"/);
});
