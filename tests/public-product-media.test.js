'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  productPhotoSources,
  productImagePath,
  productCutoutPath,
  withPublicProductMedia,
  withPublicProductList
} = require('../public-product-media');

test('fotos Base64 viram URLs públicas sem alterar URLs que já são públicas', () => {
  const product = {
    id: 999942,
    nome: 'Relógio teste',
    fotos: [
      'data:image/png;base64,AAAA',
      'https://cdn.example.com/relogio.webp'
    ]
  };
  const result = withPublicProductMedia(product);

  assert.deepEqual(result.fotos, [
    '/product-image/999942/0',
    'https://cdn.example.com/relogio.webp'
  ]);
  assert.match(product.fotos[0], /^data:image\//);
  assert.notEqual(result, product);
});

test('foto legada também ganha uma URL pública e listas inválidas são seguras', () => {
  const result = withPublicProductMedia({
    id: 999907,
    foto: 'data:image/jpeg;base64,AAAA'
  });

  assert.equal(result.foto, '/product-image/999907/0');
  assert.deepEqual(result.fotos, ['/product-image/999907/0']);
  assert.deepEqual(withPublicProductList(null), []);
  assert.equal(productImagePath(0, 0), '');
});

test('a ordem cadastrada das fotos é preservada quando não há recorte local', () => {
  const product = {
    id: 999909,
    fotos: ['primeira.webp', 'segunda.webp']
  };
  assert.deepEqual(productPhotoSources(product), ['primeira.webp', 'segunda.webp']);
  assert.deepEqual(withPublicProductMedia(product).fotos, ['primeira.webp', 'segunda.webp']);
});

test('recorte transparente local vira a primeira foto pública sem apagar a galeria', () => {
  const product = {
    id: 26,
    foto: 'foto-antiga.webp',
    fotos: ['foto-antiga.webp', 'detalhe.webp']
  };
  const result = withPublicProductMedia(product);

  assert.equal(productCutoutPath(26), '/assets/product-cutouts/26.webp');
  assert.equal(result.foto, '/assets/product-cutouts/26.webp');
  assert.deepEqual(result.fotos, [
    '/assets/product-cutouts/26.webp',
    'foto-antiga.webp',
    'detalhe.webp'
  ]);
});

test('produto futuro sem arquivo transparente continua usando a foto cadastrada', () => {
  assert.equal(productCutoutPath(999999), '');
  assert.deepEqual(withPublicProductMedia({
    id: 999999,
    fotos: ['catalogo.webp']
  }).fotos, ['catalogo.webp']);
});
