const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('carrinho móvel separa quantidade e total', () => {
  const css = read('style.css');
  assert.match(css, /grid-template-areas:\s*"photo info"\s*"quantity total"/);
  assert.match(css, /\.qty-stepper\{\s*grid-area:quantity/);
  assert.match(css, /\.cart-item > strong\{\s*grid-area:total/);
});

test('página de trocas não preenche e-mail a partir da sessão', () => {
  const script = read('return-request-form.js');
  const html = read('trocas-estornos.html');

  assert.doesNotMatch(script, /sessionEmail/);
  assert.doesNotMatch(script, /reloja_sessao/);
  assert.match(html, /id="return-email"[^>]*autocomplete="off"/);
  assert.match(html, /id="return-status-email"[^>]*autocomplete="off"/);
});
