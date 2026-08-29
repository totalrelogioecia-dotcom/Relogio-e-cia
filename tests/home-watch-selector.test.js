const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('home carrega três mostradores com somente setas laterais', () => {
  const html = read('index.html');
  assert.match(html, /home-watch-selector\.css\?v=4/);
  assert.match(html, /id="home-watch-selector"/);
  assert.match(html, /id="home-watch-stage"/);
  assert.match(html, /id="home-watch-previous"/);
  assert.match(html, /id="home-watch-next"/);
  assert.match(html, /id="home-watch-status"/);
  assert.match(html, /home-watch-selector\.js\?v=4/);
  assert.doesNotMatch(html, /home-gshock-live\.css/);
  assert.doesNotMatch(html, /home-gshock-live\.js/);
  assert.doesNotMatch(html, /id="gshock-live-clock"/);
});

test('mostrador digital usa segmentos SVG estreitos e caixa vertical', () => {
  const script = read('home-watch-selector.js');
  const css = read('home-watch-selector.css');
  assert.match(script, /const SEGMENTS =/);
  assert.match(script, /SEGMENT_SHAPES/);
  assert.match(script, /drawSegmentDigit/);
  assert.match(script, /drawDigitalTime/);
  assert.match(script, /digital-date-segments/);
  assert.match(script, /digital-time-segments/);
  assert.match(script, /viewBox="0 0 320 340"/);
  assert.match(script, /digital-case-outline/);
  assert.match(script, /digital-lcd-frame/);
  assert.doesNotMatch(script, /digital-status-icons/);
  assert.doesNotMatch(script, /rx="35"/);
  assert.match(css, /digital-lcd-segment\.is-on/);
  assert.match(css, /digital-lcd-segment\.is-off/);
  assert.match(css, /digital-lcd-gradient/);
  assert.match(css, /aspect-ratio:320\/340/);
});

test('mostradores preservam horário de Brasília e movimentos diferentes', () => {
  const script = read('home-watch-selector.js');
  assert.match(script, /America\/Sao_Paulo/);
  assert.match(script, /WATCH_COUNT = 3/);
  assert.match(script, /digital-period/);
  assert.match(script, /performance\.now\(\)/);
  assert.match(script, /chronoRunning/);
  assert.match(script, /delay = 125/);
  assert.match(script, /Math\.floor\(now\.millisecond \/ 125\)/);
  assert.match(script, /classic-second/);
  assert.match(script, /pointerdown/);
  assert.match(script, /localStorage/);
});

test('mostradores são genéricos, sem marcas visíveis, e clássico tem textura verde', () => {
  const script = read('home-watch-selector.js');
  const css = read('home-watch-selector.css');
  assert.doesNotMatch(script, /CASIO|G-SHOCK|CITIZEN|ORIENT/);
  assert.match(script, /classic-dial-gradient/);
  assert.match(script, /classic-band-gradient/);
  assert.match(script, /classic-texture/);
  assert.match(script, /★ ★ ★/);
  assert.match(css, /fill:url\(#classic-dial-gradient\)/);
  assert.match(css, /fill:url\(#classic-texture\)/);
});

test('cronógrafo possui start stop e reset sem depender de biblioteca externa', () => {
  const script = read('home-watch-selector.js');
  assert.match(script, /watch-pusher-button--start/);
  assert.match(script, /watch-pusher-button--reset/);
  assert.match(script, /aria-pressed/);
  assert.match(script, /elapsedChrono/);
  assert.doesNotMatch(script, /gsap|anime\.js|jquery/i);
});
