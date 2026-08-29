const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('home carrega o seletor leve de relógios', () => {
  const html = read('index.html');
  assert.match(html, /href="home-watch-selector\.css\?v=1"/);
  assert.match(html, /id="home-watch-selector"/);
  assert.match(html, /id="home-watch-previous"/);
  assert.match(html, /id="home-watch-next"/);
  assert.match(html, /src="home-watch-selector\.js\?v=1"/);
  assert.doesNotMatch(html, /id="analog-clock-brasilia"/);
});

test('Casio usa dia em inglês e apenas um sino', () => {
  const script = read('home-watch-selector.js');
  const bellCount = (script.match(/class="watch-alarm-icon"/g) || []).length;
  assert.equal(bellCount, 1);
  assert.match(script, /EN_WEEKDAYS = \['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'\]/);
  assert.match(script, /digital-accent/);
  assert.match(script, /digital-date/);
  assert.match(script, /digital-second/);
});

test('Citizen mantém panda, calendário inferior e cronógrafo por timestamp', () => {
  const script = read('home-watch-selector.js');
  assert.match(script, /class="panda-subdial"/);
  assert.equal((script.match(/class="panda-subdial"/g) || []).length, 3);
  assert.match(script, /id="citizen-weekday"/);
  assert.match(script, /id="citizen-date"/);
  assert.match(script, /performance\.now\(\)/);
  assert.match(script, /chronoRunning/);
  assert.match(script, /watch-pusher-button--start/);
  assert.match(script, /watch-pusher-button--reset/);
});

test('Orient usa degradê vertical e oito passos por segundo', () => {
  const script = read('home-watch-selector.js');
  assert.match(script, /linearGradient id="orient-dial-gradient" x1="0" y1="0" x2="0" y2="1"/);
  assert.match(script, /offset="0%" stop-color="#06271d"/);
  assert.match(script, /offset="50%" stop-color="#13965e"/);
  assert.match(script, /offset="100%" stop-color="#041d16"/);
  assert.match(script, /delay = 125/);
});

test('navegação salva escolha, aceita swipe e respeita aba invisível', () => {
  const script = read('home-watch-selector.js');
  assert.match(script, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(script, /pointerdown/);
  assert.match(script, /pointerup/);
  assert.match(script, /document\.hidden/);
  assert.match(script, /visibilitychange/);
});

test('script do seletor é público', () => {
  const { isPublicStaticPath } = require('../public-static-policy');
  assert.equal(isPublicStaticPath('/home-watch-selector.js'), true);
  assert.equal(isPublicStaticPath('/home-watch-selector.css'), true);
});
