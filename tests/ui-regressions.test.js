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

test('vitrine padroniza fotos sem cortar o relógio', () => {
  const css = read('style.css');

  assert.match(css, /\.product-card \.card-photo img\{[^}]*object-fit:contain/);
  assert.match(css, /\.product-card \.card-photo img\{[^}]*padding:24px/);
});

test('produto informa parcelamento e segurança sem prometer juros zero', () => {
  const script = read('produto.js');

  assert.match(script, /minimumInstallment=50/);
  assert.match(script, /Math\.min\(12,/);
  assert.match(script, /\$\{installmentCount\}x de/);
  assert.doesNotMatch(script, /Parcelas com valor mínimo de R\$ 50/);
  assert.match(script, /Pagamento seguro/);
  assert.match(script, /Processado pelo Mercado Pago/);
  assert.doesNotMatch(script, /12x[^\n<]*sem juros/i);
});

test('home não permite adicionar produto sem estoque ao carrinho', () => {
  const script = read('home-enhancements.js');

  assert.match(script, /function produtoDisponivel/);
  assert.match(script, /Number\(produto\?\.estoque \|\| 0\) > 0/);
  assert.match(script, />Indisponível<\/button>/);
  assert.match(script, /disabled aria-disabled="true"/);
  assert.match(script, /!produtoDisponivel\(produto\)/);
  assert.match(script, /data-home-add/);
});
