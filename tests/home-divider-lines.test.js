const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('linhas do bloco de horário ficam suaves e equilibradas', () => {
  const css = read('home-redesign.css');

  assert.match(css, /\.home-intro-signature::before\{[\s\S]*height:1px;[\s\S]*opacity:\.58;/);
  assert.match(css, /\.home-intro \.hero-stats::before\{[\s\S]*top:16%;[\s\S]*bottom:16%;[\s\S]*opacity:\.56;/);
  assert.match(css, /@media \(max-width:1080px\)[\s\S]*\.hero-stats::before\{ display:none; \}/);
  assert.match(css, /@media \(max-width:820px\)[\s\S]*\.hero-stats::before\{ display:block; \}/);
  assert.match(css, /@media \(max-width:620px\)[\s\S]*\.hero-stats::before\{ display:none; \}/);
});
