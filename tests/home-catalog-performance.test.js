'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_HOME_PRODUCTS_PER_BRAND,
  buildHomeCatalog
} = require('../home-catalog');

test('catálogo leve da Home limita produtos por marca e mantém apenas a primeira foto', () => {
  const products = [
    ...Array.from({ length: 6 }, (_, index) => ({
      id: index + 1,
      nome: `Relógio A ${index + 1}`,
      marca: 'Marca A',
      categoria: 'Relógios',
      preco: 100 + index,
      sku: `A-${index + 1}`,
      desc: 'Descrição que não deve ir para a Home',
      fotos: [`foto-${index + 1}-principal`, `foto-${index + 1}-extra`],
      estoque: 1,
      ativo: true
    })),
    {
      id: 20,
      nome: 'Acessório',
      marca: 'Marca A',
      categoria: 'Acessórios',
      fotos: ['acessorio'],
      estoque: 1,
      ativo: true
    },
    {
      id: 21,
      nome: 'Inativo',
      marca: 'Marca A',
      categoria: 'Relógios',
      fotos: ['inativo'],
      estoque: 1,
      ativo: false
    },
    ...Array.from({ length: 3 }, (_, index) => ({
      id: 30 + index,
      nome: `Relógio B ${index + 1}`,
      marca: 'Marca B',
      categoria: 'Relógios',
      fotos: [`foto-b-${index + 1}`],
      estoque: 0,
      ativo: true
    }))
  ];

  const result = buildHomeCatalog(products);
  assert.equal(DEFAULT_HOME_PRODUCTS_PER_BRAND, 4);
  assert.equal(result.filter(product => product.marca === 'Marca A').length, 4);
  assert.equal(result.filter(product => product.marca === 'Marca B').length, 3);
  assert.deepEqual(result[0].fotos, ['foto-1-principal']);
  assert.equal(Object.hasOwn(result[0], 'desc'), false);
  assert.equal(result.some(product => product.categoria === 'Acessórios'), false);
  assert.equal(result.some(product => product.ativo === false), false);
});

test('a Home usa a rota leve e as demais páginas preservam a rota completa', () => {
  const root = path.join(__dirname, '..');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

  assert.match(server, /app\.get\('\/api\/products\/home'/);
  assert.match(server, /buildHomeCatalog\(getProducts\(\)\)/);
  assert.match(client, /document\.querySelector\('#marcas \.brand-index'\)/);
  assert.match(client, /\? '\/api\/products\/home'/);
  assert.match(client, /: '\/api\/products'/);
});
