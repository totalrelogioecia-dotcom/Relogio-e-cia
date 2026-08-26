/* =========================================================
   RELÓGIO E CIA — perfis de caixas de envio

   As dimensões abaixo são as caixas físicas definidas pela loja.
   O peso das caixas NÃO é somado automaticamente ainda: o peso
   continua vindo do cadastro de frete do produto até a loja pesar
   caixa + proteção reais e validar a regra final.
   ========================================================= */

const BOX_PROFILES = Object.freeze({
  P: Object.freeze({ code: 'P', height: 10, width: 12, length: 12 }),
  M: Object.freeze({ code: 'M', height: 12, width: 15, length: 15 }),
  G: Object.freeze({ code: 'G', height: 24, width: 30, length: 30 })
});

function text(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function isWatch(product) {
  const category = text(product?.categoria);
  return category.includes('relogio');
}

function normalizeBoxSize(value) {
  const code = String(value || '').trim().toUpperCase();
  return BOX_PROFILES[code] ? code : '';
}

function defaultBoxSizeForProduct(product) {
  if (!isWatch(product)) return '';

  const brand = text(product?.marca).replace(/[^a-z0-9]/g, '');

  // Orient: estojo medido em 10 x 11 x 11 cm -> caixa P 10 x 12 x 12 cm.
  if (brand === 'orient') return 'P';

  // Technos simples: estojo medido em 10 x 11 x 11 cm -> caixa P.
  // Modelos/estojos especiais podem ser sobrescritos manualmente para G no Admin.
  if (brand === 'technos') return 'P';

  // G-Shock: estojo medido em 10 x 13 x 13 cm -> caixa M 12 x 15 x 15 cm.
  if (brand === 'gshock' || brand.includes('gshock')) return 'M';

  // Citizen: estojo medido em 11 x 15 x 15 cm -> caixa M.
  if (brand === 'citizen') return 'M';

  // Marcas ainda não medidas ficam sem automação e usam o cadastro manual existente.
  return '';
}

function boxSizeForProduct(product, shipping = {}) {
  return normalizeBoxSize(shipping?.box_size) || defaultBoxSizeForProduct(product);
}

function dimensionsForBox(boxSize) {
  const code = normalizeBoxSize(boxSize);
  if (!code) return null;
  const box = BOX_PROFILES[code];
  return {
    box_size: code,
    width: box.width,
    height: box.height,
    length: box.length
  };
}

function watchQuantity(items = []) {
  return items.reduce((total, item) => {
    if (!isWatch(item?.product)) return total;
    return total + Math.max(1, Number(item?.quantity) || 1);
  }, 0);
}

function orderBoxSize(items = []) {
  // Regra da loja: pedido com mais de um relógio usa a caixa G.
  if (watchQuantity(items) > 1) return 'G';

  const watch = items.find(item => isWatch(item?.product));
  if (watch) return boxSizeForProduct(watch.product, watch.shipping);

  // Para acessórios e marcas ainda não configuradas, preserva o comportamento manual.
  return '';
}

module.exports = {
  BOX_PROFILES,
  normalizeBoxSize,
  defaultBoxSizeForProduct,
  boxSizeForProduct,
  dimensionsForBox,
  watchQuantity,
  orderBoxSize,
  isWatch
};
