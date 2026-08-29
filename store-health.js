const fs = require('fs');
const path = require('path');
const { storageStatus } = require('./persistent-store');
const { configStatus: shippingConfigStatus, getEffectiveShippingData } = require('./shipping-service');
const { boxSizeForProduct, dimensionsForBox, normalizeBoxSize } = require('./shipping-packaging');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const PRODUCTS = path.join(DATA, 'products.json');

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function configured(name) {
  return Boolean(String(process.env[name] || '').trim());
}

function publicUrlStatus() {
  const value = String(process.env.PUBLIC_URL || '').trim();
  return {
    configured: Boolean(value),
    https: /^https:\/\//i.test(value)
  };
}

function buildProductShippingDiagnostic(product, shipping = {}) {
  const normalizedShipping = {
    weight: Number(shipping.weight ?? shipping.weight_kg),
    width: Number(shipping.width ?? shipping.width_cm),
    height: Number(shipping.height ?? shipping.height_cm),
    length: Number(shipping.length ?? shipping.length_cm),
    box_size: normalizeBoxSize(shipping.box_size),
    weight_source: String(shipping.weight_source || '')
  };

  const boxSize = boxSizeForProduct(product, normalizedShipping);
  const box = dimensionsForBox(boxSize);
  const missing = [];

  if (!positive(normalizedShipping.weight)) missing.push('peso');
  if (!box) {
    if (!positive(normalizedShipping.width)) missing.push('largura');
    if (!positive(normalizedShipping.height)) missing.push('altura');
    if (!positive(normalizedShipping.length)) missing.push('comprimento');
  }

  return {
    product_id: Number(product?.id),
    name: String(product?.nome || '').trim(),
    sku: String(product?.sku || '').trim(),
    brand: String(product?.marca || '').trim(),
    category: String(product?.categoria || '').trim(),
    stock: Math.max(0, Number(product?.estoque) || 0),
    visible: product?.ativo !== false,
    price: Number(product?.preco) || 0,
    ready: missing.length === 0,
    missing,
    box_size: boxSize || null,
    box_source: normalizedShipping.box_size ? 'manual' : (boxSize ? 'automática' : 'dimensões manuais'),
    weight_kg: positive(normalizedShipping.weight) ? normalizedShipping.weight : null,
    weight_source: normalizedShipping.weight_source || 'manual',
    dimensions: box
      ? { width_cm: box.width, height_cm: box.height, length_cm: box.length }
      : {
          width_cm: positive(normalizedShipping.width) ? normalizedShipping.width : null,
          height_cm: positive(normalizedShipping.height) ? normalizedShipping.height : null,
          length_cm: positive(normalizedShipping.length) ? normalizedShipping.length : null
        }
  };
}

function serviceStatus() {
  const publicUrl = publicUrlStatus();
  const shipping = shippingConfigStatus();
  const mercadoPagoToken = configured('MERCADOPAGO_ACCESS_TOKEN');
  const resendApiKey = configured('RESEND_API_KEY');
  const resendFrom = configured('RESEND_FROM');

  return {
    database: storageStatus(),
    mercado_pago: {
      configured: mercadoPagoToken && publicUrl.https,
      access_token_configured: mercadoPagoToken,
      public_url_configured: publicUrl.configured,
      public_url_https: publicUrl.https
    },
    melhor_envio: shipping,
    resend: {
      configured: resendApiKey && resendFrom,
      api_key_configured: resendApiKey,
      sender_configured: resendFrom
    }
  };
}

function collectStoreHealth() {
  const products = read(PRODUCTS, []);
  const list = Array.isArray(products) ? products : [];
  const visible = list.filter(product => product?.ativo !== false);
  const hidden = list.filter(product => product?.ativo === false);
  const diagnostics = visible.map(product => buildProductShippingDiagnostic(product, getEffectiveShippingData(product)));
  const incomplete = diagnostics.filter(item => !item.ready);
  const blocking = incomplete.filter(item => item.stock > 0);
  const waiting = incomplete.filter(item => item.stock <= 0);
  const visibleWithoutPhoto = visible.filter(product => !Array.isArray(product?.fotos) || !product.fotos.some(Boolean));
  const visibleInvalidPrice = visible.filter(product => !positive(product?.preco));
  const visibleWithoutSku = visible.filter(product => !String(product?.sku || '').trim());
  const visibleOutOfStock = visible.filter(product => Number(product?.estoque || 0) <= 0);
  const services = serviceStatus();

  const warnings = [];
  if (!services.database?.persistent) warnings.push('Banco persistente não está ativo.');
  if (!services.mercado_pago.configured) warnings.push('Mercado Pago não está completamente configurado para checkout HTTPS.');
  if (!services.melhor_envio?.configured) warnings.push('Melhor Envio não está completamente configurado.');
  else if (services.melhor_envio.environment !== 'production') warnings.push('Melhor Envio está em SANDBOX (modo de teste).');
  if (!services.resend.configured) warnings.push('Resend ainda não está completamente configurado para e-mails aos clientes.');
  if (blocking.length) warnings.push(`${blocking.length} produto(s) visível(is) e com estoque não conseguem calcular frete.`);
  if (visibleWithoutPhoto.length) warnings.push(`${visibleWithoutPhoto.length} produto(s) visível(is) estão sem foto.`);
  if (visibleInvalidPrice.length) warnings.push(`${visibleInvalidPrice.length} produto(s) visível(is) estão sem preço válido.`);

  return {
    generated_at: new Date().toISOString(),
    services,
    catalog: {
      total: list.length,
      visible: visible.length,
      hidden: hidden.length,
      visible_out_of_stock: visibleOutOfStock.length,
      visible_without_photo: visibleWithoutPhoto.length,
      visible_invalid_price: visibleInvalidPrice.length,
      visible_without_sku: visibleWithoutSku.length
    },
    shipping: {
      visible_products: diagnostics.length,
      ready: diagnostics.length - incomplete.length,
      incomplete: incomplete.length,
      blocking_in_stock: blocking.length,
      waiting_out_of_stock: waiting.length,
      products: incomplete
    },
    warnings
  };
}

module.exports = {
  buildProductShippingDiagnostic,
  collectStoreHealth,
  serviceStatus
};
