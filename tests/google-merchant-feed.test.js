const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function loadSeoModule(products, details = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-merchant-feed-'));
  fs.writeFileSync(path.join(tempDir, 'products.json'), JSON.stringify(products, null, 2), 'utf8');
  fs.writeFileSync(path.join(tempDir, 'product-details.json'), JSON.stringify(details, null, 2), 'utf8');

  const previousDataDir = process.env.DATA_DIR;
  const previousBaseUrl = process.env.PUBLIC_BASE_URL;
  process.env.DATA_DIR = tempDir;
  process.env.PUBLIC_BASE_URL = 'https://loja.exemplo.com';

  const modulePath = require.resolve('../seo-routes');
  delete require.cache[modulePath];
  const seo = require('../seo-routes');

  return {
    seo,
    cleanup() {
      delete require.cache[modulePath];
      if (previousDataDir === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = previousDataDir;
      if (previousBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
      else process.env.PUBLIC_BASE_URL = previousBaseUrl;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

test('feed Merchant gera RSS 2.0 com dados obrigatórios e estoque real', () => {
  const products = [
    {
      id: 7,
      nome: 'Casio F-91W-1',
      marca: 'Casio',
      categoria: 'Relógios',
      preco: 129.9,
      sku: 'F-91W-1',
      desc: 'Relógio digital preto para uso diário.',
      fotos: ['https://images.example.com/f91w.jpg'],
      estoque: 0,
      ativo: true
    },
    {
      id: 8,
      nome: 'Produto oculto',
      marca: 'Casio',
      categoria: 'Relógios',
      preco: 100,
      sku: 'OCULTO',
      fotos: ['https://images.example.com/oculto.jpg'],
      estoque: 1,
      ativo: false
    }
  ];
  const { seo, cleanup } = loadSeoModule(products, { '7': { cor: 'Preto' } });

  try {
    const xml = seo.merchantFeedXml(seo.visibleProducts(), { '7': { cor: 'Preto' } }, 'https://loja.exemplo.com');
    assert.match(xml, /<rss xmlns:g="http:\/\/base\.google\.com\/ns\/1\.0" version="2\.0">/);
    assert.match(xml, /<g:id>relogio-7<\/g:id>/);
    assert.match(xml, /<g:title>Casio F-91W-1<\/g:title>/);
    assert.match(xml, /<g:link>https:\/\/loja\.exemplo\.com\/produto\.html\?id=7<\/g:link>/);
    assert.match(xml, /<g:image_link>https:\/\/images\.example\.com\/f91w\.jpg<\/g:image_link>/);
    assert.match(xml, /<g:availability>out_of_stock<\/g:availability>/);
    assert.match(xml, /<g:price>129\.90 BRL<\/g:price>/);
    assert.match(xml, /<g:brand>Casio<\/g:brand>/);
    assert.match(xml, /<g:gender>unisex<\/g:gender>/);
    assert.match(xml, /<g:age_group>adult<\/g:age_group>/);
    assert.match(xml, /<g:mpn>F-91W-1<\/g:mpn>/);
    assert.match(xml, /<g:color>Preto<\/g:color>/);
    assert.doesNotMatch(xml, /OCULTO/);
  } finally {
    cleanup();
  }
});

test('feed classifica gênero por texto explícito sem adivinhar os demais modelos', () => {
  const products = [
    {
      id: 1,
      nome: 'Casio Vintage Feminino',
      marca: 'Casio',
      categoria: 'Relógios',
      preco: 200,
      sku: 'FEM-1',
      desc: 'Relógio digital feminino.',
      fotos: ['https://images.example.com/fem.jpg'],
      ativo: true
    },
    {
      id: 2,
      nome: 'Relógio Masculino',
      marca: 'Technos',
      categoria: 'Relógios',
      preco: 300,
      sku: 'MASC-1',
      desc: 'Modelo masculino clássico.',
      fotos: ['https://images.example.com/masc.jpg'],
      ativo: true
    },
    {
      id: 3,
      nome: 'G-Shock GA-100',
      marca: 'G-Shock',
      categoria: 'Relógios',
      preco: 500,
      sku: 'GA-100',
      desc: 'Relógio resistente a choques.',
      fotos: ['https://images.example.com/unisex.jpg'],
      ativo: true
    }
  ];
  const { seo, cleanup } = loadSeoModule(products);

  try {
    assert.equal(seo.merchantGender(products[0]), 'female');
    assert.equal(seo.merchantGender(products[1]), 'male');
    assert.equal(seo.merchantGender(products[2]), 'unisex');
    const xml = seo.merchantFeedXml(products, {}, 'https://loja.exemplo.com');
    assert.match(xml, /<g:id>relogio-1<\/g:id>[\s\S]*?<g:gender>female<\/g:gender>/);
    assert.match(xml, /<g:id>relogio-2<\/g:id>[\s\S]*?<g:gender>male<\/g:gender>/);
    assert.match(xml, /<g:id>relogio-3<\/g:id>[\s\S]*?<g:gender>unisex<\/g:gender>/);
  } finally {
    cleanup();
  }
});

test('feed usa idade adulta por padrão e kids quando o produto é explicitamente infantil', () => {
  const adult = { nome: 'Casio F-91W', desc: 'Relógio digital', categoria: 'Relógios' };
  const kids = { nome: 'Relógio infantil', desc: 'Modelo para crianças', categoria: 'Relógios' };
  const { seo, cleanup } = loadSeoModule([]);

  try {
    assert.equal(seo.merchantAgeGroup(adult), 'adult');
    assert.equal(seo.merchantAgeGroup(kids), 'kids');
  } finally {
    cleanup();
  }
});

test('feed usa URL pública para fotos armazenadas como data URI', () => {
  const png = Buffer.from('imagem-de-teste').toString('base64');
  const product = {
    id: 11,
    nome: 'Relógio Teste',
    marca: 'Technos',
    categoria: 'Relógios',
    preco: 500,
    sku: 'TEC-11',
    desc: 'Teste',
    fotos: [`data:image/png;base64,${png}`],
    estoque: 0,
    ativo: true
  };
  const { seo, cleanup } = loadSeoModule([product]);

  try {
    assert.equal(
      seo.merchantImageLink(product, 'https://loja.exemplo.com'),
      'https://loja.exemplo.com/merchant-product-image/11'
    );
    const decoded = seo.decodeDataImage(product.fotos[0]);
    assert.equal(decoded.type, 'image/png');
    assert.deepEqual(decoded.bytes, Buffer.from('imagem-de-teste'));
  } finally {
    cleanup();
  }
});

test('feed ignora produto visível sem preço ou imagem válidos', () => {
  const { seo, cleanup } = loadSeoModule([
    { id: 1, nome: 'Sem preço', marca: 'Casio', preco: 0, fotos: ['https://images.example.com/a.jpg'], ativo: true },
    { id: 2, nome: 'Sem foto', marca: 'Casio', preco: 100, fotos: [], ativo: true }
  ]);

  try {
    const xml = seo.merchantFeedXml(seo.visibleProducts(), {}, 'https://loja.exemplo.com');
    assert.doesNotMatch(xml, /relogio-1/);
    assert.doesNotMatch(xml, /relogio-2/);
  } finally {
    cleanup();
  }
});
