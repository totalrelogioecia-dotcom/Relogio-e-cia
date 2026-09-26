const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Conta e Carrinho carregam refinamento visual isolado', () => {
  const conta = read('conta.html');
  const carrinho = read('carrinho.html');
  assert.match(conta, /<body class="page-account">/);
  assert.match(carrinho, /<body class="page-cart">/);
  assert.match(conta, /commerce-polish\.css\?v=20260926-commerce-polish-1/);
  assert.match(carrinho, /commerce-polish\.css\?v=20260926-commerce-polish-1/);
});

test('Conta recebe card premium sem alterar o host funcional', () => {
  const css = read('commerce-polish.css');
  const conta = read('conta.html');
  assert.match(conta, /<div class="account-box" id="account-box"><\/div>/);
  assert.match(css, /body\.page-account \.account-box\{[\s\S]*border:1px solid var\(--line\);[\s\S]*border-radius:14px;[\s\S]*box-shadow:/);
  assert.match(css, /body\.page-account \.account-box::before\{[\s\S]*background:var\(--red\);/);
});

test('Carrinho vazio e com produto recebem acabamento visual', () => {
  const css = read('commerce-polish.css');
  const carrinho = read('carrinho.html');
  assert.match(carrinho, /id="cart-list"/);
  assert.match(carrinho, /id="shipping-box-host"/);
  assert.match(carrinho, /id="cart-summary-box"/);
  assert.match(css, /body\.page-cart #cart-list > \.empty-state\{/);
  assert.match(css, /body\.page-cart \.cart-item\{/);
  assert.match(css, /body\.page-cart \.cart-summary\{/);
  assert.match(css, /body\.page-cart \.cart-delivery-host \.shipping-box\{/);
  assert.match(css, /body\.page-cart \.coupon-box\{/);
  assert.match(css, /body\.page-cart \.payment-option\{/);
});

test('Refinamento mantém responsividade e movimento reduzido', () => {
  const css = read('commerce-polish.css');
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css, /@media \(max-width:980px\)[\s\S]*body\.page-cart \.cart-layout\{[\s\S]*grid-template-columns:1fr;/);
  assert.match(css, /@media \(max-width:640px\)[\s\S]*body\.page-cart \.cart-item\{/);
});
