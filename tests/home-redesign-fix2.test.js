const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('abertura reorganizada mantém o relógio compacto sem depender da ordem dos CSS', () => {
  const css = read('home-redesign.css');
  assert.match(css, /body\.page-home \.home-intro \.clock-panel\{[\s\S]*?flex-direction:row;[\s\S]*?justify-content:flex-start;[\s\S]*?text-align:left;/);
  assert.match(css, /body\.page-home \.home-intro \.clock-panel \.clock-face-wrap\{/);
  assert.match(css, /body\.page-home \.home-intro \.stopwatch-label\{/);
  assert.match(css, /body\.page-home \.home-intro \.stopwatch-caption\{/);
});

test('abertura reorganizada protege o espaçamento das seções e força o CSS novo', () => {
  const css = read('home-redesign.css');
  const html = read('index.html');
  assert.match(css, /:is\(\.section, #marcas, #sobre-teaser\)/);
  assert.match(html, /home-redesign\.css\?v=20260925-light-spacing-1/);
  assert.ok(
    html.indexOf('site-experience.css') < html.indexOf('home-redesign.css?v=20260925-light-spacing-1'),
    'o refinamento específico da Home deve continuar carregando por último'
  );
});
