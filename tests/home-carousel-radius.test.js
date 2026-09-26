const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.resolve(__dirname, '..', 'home-redesign.css'), 'utf8');

test('carrossel da Home usa cantos discretos', () => {
  assert.match(css, /body\.page-home \.home-intro \.home-carousel\{\s*border-radius:10px;\s*\}/);
  assert.match(css, /body\.page-home \.home-intro \.home-carousel-stage\{[\s\S]*border-radius:inherit;/);
  assert.match(css, /body\.page-home \.home-intro \.home-carousel-frame,[\s\S]*border-radius:inherit;/);
});

test('CTA do carrossel segue o raio padrão dos botões', () => {
  assert.match(css, /body\.page-home \.home-intro \.home-carousel-cta\{[\s\S]*border-radius:var\(--control-radius, 7px\);/);
});
