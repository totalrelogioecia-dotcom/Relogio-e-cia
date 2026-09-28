const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('página do produto mostra PIX e principais bandeiras de cartão', () => {
  const js = read('produto.js');
  assert.match(js, /Formas de pagamento/);
  assert.match(js, /5% de desconto/);
  for (const brand of ['VISA','Mastercard','AMEX','ELO','Hipercard']) {
    assert.ok(js.includes('>' + brand + '<'), brand);
  }
  assert.match(js, /Mercado Pago/);
  assert.match(js, /disponibilidade dos meios e eventuais juros são confirmados no checkout/);
});

test('bloco de pagamento é discreto e responsivo', () => {
  const css = read('produto.css');
  assert.match(css, /\.product-payment-methods\{display:grid/);
  assert.match(css, /\.product-card-brands\{display:flex;flex-wrap:wrap/);
  assert.match(css, /@media\(max-width:760px\)\{\.product-payment-methods\{grid-template-columns:1fr\}/);
});

test('produto carrega versões novas do bloco de pagamento', () => {
  const html = read('produto.html');
  assert.match(html, /produto\.css\?v=20260928-payment-methods-1/);
  assert.match(html, /produto\.js\?v=20260928-payment-methods-1/);
});
