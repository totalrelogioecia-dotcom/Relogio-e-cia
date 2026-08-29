const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('home exibe somente o relógio analógico de Brasília', () => {
  const html = read('index.html');
  assert.match(html, /id="analog-clock-brasilia"/);
  assert.match(html, /id="clock-ticks"/);
  assert.match(html, /id="hand-hour"/);
  assert.match(html, /id="hand-minute"/);
  assert.match(html, /id="hand-second"/);
  assert.match(html, /id="stopwatch-data"/);
  assert.doesNotMatch(html, /home-watch-selector/);
  assert.doesNotMatch(html, /home-watch-previous/);
  assert.doesNotMatch(html, /home-watch-next/);
});

test('relógio único usa a lógica existente de horário de Brasília', () => {
  const script = read('home-enhancements.js');
  const css = read('home-enhancements.css');
  assert.match(script, /function iniciarRelogioBrasilia\(\)/);
  assert.match(script, /America\/Sao_Paulo/);
  assert.match(script, /getElementById\('analog-clock-brasilia'\)/);
  assert.match(css, /#analog-clock-brasilia/);
});
