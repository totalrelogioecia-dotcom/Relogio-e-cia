'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PRODUCT_CUTOUT_DIR = path.join(__dirname, 'assets', 'product-cutouts');

function loadProductCutoutIds() {
  try {
    return new Set(
      fs.readdirSync(PRODUCT_CUTOUT_DIR)
        .map(fileName => /^(\d+)\.webp$/i.exec(fileName))
        .filter(Boolean)
        .map(match => Number(match[1]))
        .filter(id => Number.isInteger(id) && id > 0)
    );
  } catch {
    return new Set();
  }
}

const PRODUCT_CUTOUT_IDS = loadProductCutoutIds();

function productPhotoSources(product) {
  const photos = Array.isArray(product?.fotos)
    ? product.fotos.filter(value => typeof value === 'string' && value.trim())
    : [];
  if (photos.length) return photos.map(value => value.trim());
  const fallback = typeof product?.foto === 'string' ? product.foto.trim() : '';
  return fallback ? [fallback] : [];
}

function productImagePath(productId, index = 0) {
  const id = Number(productId);
  const position = Number(index);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(position) || position < 0) return '';
  return `/product-image/${encodeURIComponent(id)}/${encodeURIComponent(position)}`;
}

function productCutoutPath(productId) {
  const id = Number(productId);
  if (!Number.isInteger(id) || id <= 0 || !PRODUCT_CUTOUT_IDS.has(id)) return '';
  return `/assets/product-cutouts/${encodeURIComponent(id)}.webp`;
}

function publicPhotoValue(productId, value, index = 0) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^data:image\//i.test(raw) ? productImagePath(productId, index) : raw;
}

function withPublicProductMedia(product) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) return product;
  const result = { ...product };
  const sources = productPhotoSources(product);
  const originalPhotos = sources
    .map((value, index) => publicPhotoValue(product.id, value, index))
    .filter(Boolean);
  const cutout = productCutoutPath(product.id);
  const photos = cutout
    ? [cutout, ...originalPhotos.filter(value => value !== cutout)]
    : originalPhotos;

  if (cutout || sources.length || Array.isArray(product.fotos)) result.fotos = photos;
  if (cutout || typeof product.foto === 'string') {
    result.foto = photos[0] || publicPhotoValue(product.id, product.foto, 0);
  }
  return result;
}

function withPublicProductList(products) {
  return (Array.isArray(products) ? products : []).map(withPublicProductMedia);
}

module.exports = {
  productPhotoSources,
  productImagePath,
  productCutoutPath,
  publicPhotoValue,
  withPublicProductMedia,
  withPublicProductList
};
