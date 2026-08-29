const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('home exibe somente o relógio G-Shock digital de Brasília', () => {
  const html = read('index.html');
  assert.match(html, /home-gshock-live\.css\?v=1/);
  assert.match(html, /id="gshock-live-clock"/);
  assert.match(html, /id="gshock-live-weekday"/);
  assert.match(html, /id="gshock-live-period"/);
  assert.match(html, /id="gshock-live-date"/);
  assert.match(html, /id="gshock-live-time"/);
  assert.match(html, /home-gshock-live\.js\?v=1/);
  assert.doesNotMatch(html, /id="analog-clock-brasilia"/);
  assert.doesNotMatch(html, /home-watch-selector/);
});

test('LCD usa segmentos próprios e horário real de Brasília', () => {
  const script = read('home-gshock-live.js');
  const css = read('home-gshock-live.css');
  assert.match(script, /America\/Sao_Paulo/);
  assert.match(script, /Intl\.DateTimeFormat\('en-US'/);
  assert.match(script, /SEGMENTS/);
  assert.match(script, /drawTime/);
  assert.match(script, /drawDate/);
  assert.match(script, /dayPeriod/);
  assert.match(script, /document\.hidden/);
  assert.match(css, /data:image\/webp;base64,/);
  assert.doesNotMatch(css, /__GSHOCK_WEBP_BASE64__/);
});
