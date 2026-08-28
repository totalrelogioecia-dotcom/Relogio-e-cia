const fs = require('fs');
const path = require('path');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const DETAILS = path.join(DATA, 'product-details.json');

const PRONTA_ENTREGA = 'pronta_entrega';
const SOB_ENCOMENDA = 'sob_encomenda';
const MEDIANTE_CONFIRMACAO = 'mediante_confirmacao';
const DEFAULT_PREPARATION_DAYS = 15;

function readDetails() {
  try {
    const value = JSON.parse(fs.readFileSync(DETAILS, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function normalizeAvailability(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === SOB_ENCOMENDA) return SOB_ENCOMENDA;
  if (normalized === MEDIANTE_CONFIRMACAO) return MEDIANTE_CONFIRMACAO;
  return PRONTA_ENTREGA;
}

function normalizedBrand(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

function supportsFlexibleAvailability(product) {
  const brand = normalizedBrand(product?.marca);
  return brand === 'casio' || brand === 'g-shock' || brand === 'gshock';
}

function preparationDays(value) {
  const days = Math.round(Number(value) || DEFAULT_PREPARATION_DAYS);
  return Math.max(DEFAULT_PREPARATION_DAYS, Math.min(90, days));
}

function availabilityForProduct(product, detailsMap = null) {
  if (!supportsFlexibleAvailability(product)) {
    return {
      type: PRONTA_ENTREGA,
      preparation_days: 0
    };
  }

  const map = detailsMap || readDetails();
  const details = map[String(product?.id)] || {};
  const type = normalizeAvailability(details.disponibilidade);
  return {
    type,
    preparation_days: type === SOB_ENCOMENDA
      ? preparationDays(details.prazo_preparacao_dias_uteis)
      : 0
  };
}

function validateCheckoutAvailability(product, quantity, detailsMap = null) {
  const availability = availabilityForProduct(product, detailsMap);

  if (availability.type === MEDIANTE_CONFIRMACAO) {
    const error = new Error(`${product?.nome || 'Este produto'} precisa de confirmação de disponibilidade antes do pagamento.`);
    error.status = 409;
    error.code = 'product_confirmation_required';
    throw error;
  }

  if (availability.type === PRONTA_ENTREGA && Number(product?.estoque || 0) < Number(quantity || 0)) {
    const error = new Error(`Estoque insuficiente para ${product?.nome || 'este produto'}.`);
    error.status = 409;
    error.code = 'product_stock_insufficient';
    throw error;
  }

  return availability;
}

function shouldApplyPhysicalStock(item) {
  return normalizeAvailability(item?.disponibilidade) === PRONTA_ENTREGA;
}

module.exports = {
  PRONTA_ENTREGA,
  SOB_ENCOMENDA,
  MEDIANTE_CONFIRMACAO,
  DEFAULT_PREPARATION_DAYS,
  DETAILS,
  readDetails,
  normalizeAvailability,
  supportsFlexibleAvailability,
  preparationDays,
  availabilityForProduct,
  validateCheckoutAvailability,
  shouldApplyPhysicalStock
};
