const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('mobile-catalog-timeline-fix.css', 'utf8');
const mobileFixes = fs.readFileSync('mobile-fixes.css', 'utf8');

test('catálogo mobile usa duas colunas em telas comuns de celular', () => {
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.product-grid\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important;/);
});

test('telas muito estreitas mantêm fallback de uma coluna', () => {
  assert.match(css, /@media \(max-width: 330px\)[\s\S]*?grid-template-columns:1fr!important;/);
});

test('timeline mobile remove marcador absoluto que invadia o texto', () => {
  assert.match(css, /\.timeline-points li::before\{[\s\S]*?display:none!important;[\s\S]*?content:none!important;/);
});

test('correção fina é carregada depois da revisão mobile principal', () => {
  const base = mobileFixes.indexOf("mobile-complete-review.css?v=1");
  const fine = mobileFixes.indexOf("mobile-catalog-timeline-fix.css?v=1");
  assert.ok(base >= 0 && fine > base);
});
