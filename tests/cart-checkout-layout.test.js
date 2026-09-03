const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('entrega fica no conteúdo principal e valores permanecem no resumo', () => {
  const html = read('carrinho.html');
  const shipping = read('shipping-cart.js');

  const mainStart = html.indexOf('class="cart-main-column"');
  const deliveryHost = html.indexOf('id="shipping-box-host"');
  const summaryStart = html.indexOf('id="cart-summary-box"');

  assert.ok(mainStart >= 0 && deliveryHost > mainStart && summaryStart > deliveryHost);
  assert.match(shipping, /deliveryHost\.appendChild\(box\)/);
  assert.match(shipping, /deliveryHost\.hidden = !cart\(\)\.length/);
  assert.match(shipping, /id="shipping-address-slot"/);
  assert.match(shipping, /shippingRow\.id = 'cart-shipping-row'/);
});

test('cupom é recolhível sem alterar os campos usados no checkout', () => {
  const source = read('cart-coupons.js');
  const styles = read('cart-coupons.css');

  assert.match(source, /createElement\('details'\)/);
  assert.match(source, /id="coupon-code"/);
  assert.match(source, /id="coupon-apply"/);
  assert.match(source, /Tenho um cupom/);
  assert.match(source, /insertBefore\(box, paymentTitle \|\| form\)/);
  assert.match(styles, /\.coupon-box\[open\]/);
});

test('pagamento e aviso legal ficam compactos na lateral', () => {
  const html = read('carrinho.html');
  const legal = read('legal-footer.js');

  assert.match(html, /id="payment-title">Pagamento/);
  assert.match(html, /id="payment-form" aria-labelledby="payment-title"/);
  assert.doesNotMatch(html, /No PIX, você paga diretamente nesta loja sem precisar entrar/);
  assert.match(legal, /Ao finalizar, você confirma os/);
  assert.match(legal, /insertBefore\(summary, checkoutButton\.nextSibling\)/);
});
