const fs=require('fs');
const assert=require('assert');
const css=fs.readFileSync('product-photo-favorites-fix.css','utf8');
const mobile=fs.readFileSync('mobile-fixes.css','utf8');

assert(mobile.includes("product-photo-favorites-fix.css?v=1"),'CSS de integridade das fotos deve ser carregado');
assert(css.includes('.product-card .card-photo{'),'área da foto deve criar contexto próprio');
assert(css.includes('overflow:hidden!important'),'coração deve ficar contido na foto');
assert(css.includes('z-index:3!important'),'coração deve usar camada baixa dentro do card');
assert(css.includes('.site-header{'),'cabeçalho deve ficar acima dos cards');
assert(css.includes('z-index:1200!important'),'cabeçalho deve superar a camada do favorito');
assert(css.includes('html.reloja-dark .product-card .card-photo'),'modo escuro deve padronizar o fundo da foto');
assert(css.includes('background:#fff!important'),'fundo da área da foto deve permanecer branco no modo escuro');
assert(css.includes('filter:none!important'),'fotos não podem receber filtro visual');
assert(css.includes('mix-blend-mode:normal!important'),'fotos devem manter composição original');
console.log('product-photo-favorites-fix.test.js OK');
