'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  productPhotoSources,
  productImagePath,
  withPublicProductMedia,
  withPublicProductList
} = require('../public-product-media');

test('fotos Base64 viram URLs públicas sem alterar URLs que já são públicas', () => {
  const product = {
    id: 42,
    nome: 'Relógio teste',
    fotos: [
      'data:image/png;base64,AAAA',
      'https://cdn.example.com/relogio.webp'
    ]
  };
  const result = withPublicProductMedia(product);

  assert.deepEqual(result.fotos, [
    '/product-image/42/0',
    'https://cdn.example.com/relogio.webp'
  ]);
  assert.match(product.fotos[0], /^data:image\//);
  assert.notEqual(result, product);
});

test('foto legada também ganha uma URL pública e listas inválidas são seguras', () => {
  const result = withPublicProductMedia({
    id: 7,
    foto: 'data:image/jpeg;base64,AAAA'
  });

  assert.equal(result.foto, '/product-image/7/0');
  assert.deepEqual(result.fotos, ['/product-image/7/0']);
  assert.deepEqual(withPublicProductList(null), []);
  assert.equal(productImagePath(0, 0), '');
});

test('a ordem cadastrada das fotos é preservada', () => {
  const product = {
    id: 9,
    fotos: ['primeira.webp', 'segunda.webp']
  };
  assert.deepEqual(productPhotoSources(product), ['primeira.webp', 'segunda.webp']);
  assert.deepEqual(withPublicProductMedia(product).fotos, ['primeira.webp', 'segunda.webp']);
});
