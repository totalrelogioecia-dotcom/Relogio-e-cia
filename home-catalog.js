'use strict';

const DEFAULT_HOME_PRODUCTS_PER_BRAND = 10;

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function firstPhoto(product) {
  const photos = Array.isArray(product?.fotos) ? product.fotos : [];
  const photo = photos.find(value => typeof value === 'string' && value.trim());
  if (photo) return photo.trim();
  return typeof product?.foto === 'string' ? product.foto.trim() : '';
}

function productHasStock(product) {
  return Number(product?.estoque || 0) > 0;
}

function buildHomeCatalog(products, options = {}) {
  const requestedLimit = Number(options.limitPerBrand);
  const limitPerBrand = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, DEFAULT_HOME_PRODUCTS_PER_BRAND)
    : DEFAULT_HOME_PRODUCTS_PER_BRAND;
  const orderedProducts = (Array.isArray(products) ? products : [])
    .map((product, index) => ({ product, index }))
    .sort((itemA, itemB) => {
      const stockDifference = Number(productHasStock(itemB.product))
        - Number(productHasStock(itemA.product));
      return stockDifference || itemA.index - itemB.index;
    });
  const counts = new Map();
  const result = [];

  for (const { product } of orderedProducts) {
    if (!product || product.ativo === false) continue;
    if (!normalizeKey(product.categoria).includes('relog')) continue;

    const id = Number(product.id);
    const brand = String(product.marca || '').trim();
    const brandKey = normalizeKey(brand);
    if (!Number.isFinite(id) || !brandKey) continue;

    const count = counts.get(brandKey) || 0;
    if (count >= limitPerBrand) continue;
    counts.set(brandKey, count + 1);

    const photo = firstPhoto(product);
    result.push({
      id,
      nome: String(product.nome || '').trim(),
      marca: brand,
      categoria: String(product.categoria || 'Relógios').trim(),
      preco: Number(product.preco) || 0,
      sku: String(product.sku || '').trim(),
      fotos: photo ? [photo] : [],
      estoque: Math.max(0, Number(product.estoque) || 0),
      ativo: true
    });
  }

  return result;
}

module.exports = {
  DEFAULT_HOME_PRODUCTS_PER_BRAND,
  buildHomeCatalog
};
