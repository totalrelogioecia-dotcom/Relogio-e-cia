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
    assert.match(header, /class="nav-cta"[^>]*>Produtos<\/a>/, page);
    const primaryLinks = header.match(/<ul class="nav-links">[\s\S]*?<\/ul>/)?.[0] || '';
    assert.doesNotMatch(primaryLinks, />Produtos<\/a>/, page);
    assert.match(header, />Sobre nós<\/a>/, page);
    assert.match(header, />Conta<\/a>/, page);
    assert.match(header, />Carrinho /, page);
    assert.doesNotMatch(header, />Início<\/a>/, page);
    assert.doesNotMatch(header, />Nossa loja<\/a>/, page);
    assert.doesNotMatch(header, />Ver catálogo<\/a>/, page);
  }
});

test('logo identifica a página inicial e menu móvel recria somente o acesso necessário a Produtos', () => {
  const home = read('index.html');
  const script = read('script.js');
  const mobile = read('mobile-fixes.css');
  assert.match(home, /class="brand-mark" aria-current="page"/);
  assert.doesNotMatch(script, /nav-mobile-only[^\n]+Ver catálogo/);
  assert.match(script, /nav-mobile-catalog[^\n]+Produtos<\/a>/);
  assert.doesNotMatch(mobile, /sobre\.html#loja/);
  assert.match(script, /toggle\.textContent = 'Menu'/);
  const style = read('style.css');
  const searchStyle = read('site-search.css');
  assert.match(style, /font-family:var\(--font-mono\);[\s\S]*font-size:\.76rem;[\s\S]*letter-spacing:\.06em/);
  assert.match(style, /\.site-header \.nav-cta\{[\s\S]*background:var\(--red\)/);
  assert.match(searchStyle, /font-weight:500;letter-spacing:\.06em/);
  assert.match(script, /link\.setAttribute\('aria-label'/);
  assert.match(style, /\.nav-account-label\{[\s\S]*max-width:12ch;[\s\S]*text-overflow:ellipsis/);
});
