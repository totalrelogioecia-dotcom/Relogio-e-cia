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
  assert.doesNotMatch(html, /home-gshock-live\.css/);
  assert.doesNotMatch(html, /home-gshock-live\.js/);
  assert.doesNotMatch(html, /id="gshock-live-clock"/);
  assert.doesNotMatch(html, /home-watch-selector/);
});

test('relógio analógico usa horário real de Brasília e ponteiros dinâmicos', () => {
  const script = read('home-enhancements.js');
  const css = read('home-enhancements.css');
  assert.match(script, /America\/Sao_Paulo/);
  assert.match(script, /Intl\.DateTimeFormat\('pt-BR'/);
  assert.match(script, /analog-clock-brasilia/);
  assert.match(script, /clock-ticks/);
  assert.match(script, /hand-hour/);
  assert.match(script, /hand-minute/);
  assert.match(script, /hand-second/);
  assert.match(script, /requestAnimationFrame/);
  assert.match(script, /rotate\(/);
  assert.match(script, /month: '2-digit'/);
  assert.match(script, /dataEl\.textContent = `\$\{horaTexto\} · \$\{dateFormatter\.format\(agora\)\}`/);
  assert.match(read('index.html'), /home-enhancements\.js\?v=20260925-clock-compact-1/);
  assert.match(css, /#analog-clock-brasilia/);
});
