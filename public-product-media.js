'use strict';

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

function publicPhotoValue(productId, value, index = 0) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^data:image\//i.test(raw) ? productImagePath(productId, index) : raw;
}

function withPublicProductMedia(product) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) return product;
  const result = { ...product };
  const sources = productPhotoSources(product);
  const photos = sources
    .map((value, index) => publicPhotoValue(product.id, value, index))
    .filter(Boolean);

  if (sources.length || Array.isArray(product.fotos)) result.fotos = photos;
  if (typeof product.foto === 'string') {
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
  publicPhotoValue,
  withPublicProductMedia,
  withPublicProductList
};
