const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const publicPages = [
  'index.html',
  'produtos.html',
  'produto.html',
  'sobre.html',
  'conta.html',
  'enderecos.html',
  'carrinho.html',
  'politica-de-privacidade.html',
  'termos-de-uso.html',
  'trocas-estornos.html'
];

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

test('cabeçalho público mantém somente navegação essencial', () => {
  for (const page of publicPages) {
    const html = read(page);
    const header = html.match(/<header class="site-header">[\s\S]*?<\/header>/)?.[0] || '';
    assert.match(header, />Produtos<\/a>/, page);
    assert.match(header, />Sobre nós<\/a>/, page);
    assert.match(header, />Conta<\/a>/, page);
    assert.match(header, />Carrinho /, page);
    assert.doesNotMatch(header, />Início<\/a>/, page);
    assert.doesNotMatch(header, />Nossa loja<\/a>/, page);
    assert.doesNotMatch(header, />Ver catálogo<\/a>/, page);
  }
});

test('logo identifica a página inicial e menu móvel não recria CTA redundante', () => {
  const home = read('index.html');
  const script = read('script.js');
  const mobile = read('mobile-fixes.css');
  assert.match(home, /class="brand-mark" aria-current="page"/);
  assert.doesNotMatch(script, /nav-mobile-only[^\n]+Ver catálogo/);
  assert.doesNotMatch(mobile, /sobre\.html#loja/);
  assert.match(script, /toggle\.textContent = 'Menu'/);
});
