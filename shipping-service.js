const fs = require('fs');
const path = require('path');
const {
  envMode,
  baseUrl,
  userAgent,
  getAccessToken,
  status: authStatus
} = require('./melhorenvio-auth');
const {
  boxSizeForProduct,
  dimensionsForBox,
  orderBoxSize,
  defaultShippingWeightKg
} = require('./shipping-packaging');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const PRODUCTS = path.join(DATA, 'products.json');
const SHIPPING_PRODUCTS = path.join(DATA, 'shipping-products.json');

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function originPostalCode() {
  return digits(process.env.MELHORENVIO_FROM_POSTAL_CODE).slice(0, 8);
}

function isConfigured() {
  const auth = authStatus();
  return Boolean(auth.connected && originPostalCode().length === 8 && userAgent());
}

function configStatus() {
  const auth = authStatus();
  return {
    configured: isConfigured(),
    environment: envMode(),
    connected: auth.connected,
    auth_mode: auth.auth_mode,
    token_configured: auth.access_token_available,
    oauth_configured: auth.oauth_configured,
    origin_postal_code_configured: originPostalCode().length === 8,
    user_agent_configured: Boolean(userAgent())
  };
}

function shippingMap() {
  const raw = read(SHIPPING_PRODUCTS, {});
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

function getShippingData(productId) {
  const map = shippingMap();
  const data = map[String(productId)] || {};
  const num = value => Number(value);
  return {
    weight: num(data.weight_kg),
    width: num(data.width_cm),
    height: num(data.height_cm),
    length: num(data.length_cm),
    box_size: String(data.box_size || '').trim().toUpperCase()
  };
}

function getEffectiveShippingData(product) {
  const data = getShippingData(product?.id);
  const standardWeight = defaultShippingWeightKg(product);
  const hasStandard = Number.isFinite(Number(standardWeight)) && Number(standardWeight) > 0;
  return {
    ...data,
    weight: hasStandard ? Number(standardWeight) : data.weight,
    weight_source: hasStandard ? 'brand_standard' : 'manual'
  };
}

function validateShippingData(product, data, automaticBoxSize = '') {
  const fields = [['peso', data.weight]];

  // Quando há uma caixa P/M/G definida, as dimensões vêm do perfil da caixa.
  // Caso contrário, preservamos o cadastro manual de dimensões já existente.
  if (!dimensionsForBox(automaticBoxSize)) {
    fields.push(
      ['largura', data.width],
      ['altura', data.height],
      ['comprimento', data.length]
    );
  }

  const missing = fields
    .filter(([, value]) => !Number.isFinite(value) || value <= 0)
    .map(([name]) => name);

  if (!missing.length) return null;
  return `${product.nome || `Produto ${product.id}`} (${missing.join(', ')})`;
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    const error = new Error('Carrinho vazio.');
    error.status = 400;
    throw error;
  }

  const products = read(PRODUCTS, []);
  const normalized = rawItems.map(raw => {
    const product = products.find(p => Number(p.id) === Number(raw.id) && p.ativo !== false);
    if (!product) {
      const error = new Error('Um produto do carrinho não foi encontrado.');
      error.status = 400;
      throw error;
    }

    const quantity = Math.max(1, Math.min(99, Number(raw.qtd) || 1));
    const shipping = getEffectiveShippingData(product);
    const boxSize = boxSizeForProduct(product, shipping);
    return { product, quantity, shipping, boxSize };
  });

  const selectedOrderBox = orderBoxSize(normalized);
  const missing = [];

  normalized.forEach(({ product, shipping, boxSize }) => {
    const effectiveBox = selectedOrderBox || boxSize;
    const issue = validateShippingData(product, shipping, effectiveBox);
    if (issue) missing.push(issue);
  });

  if (missing.length) {
    const error = new Error(`Cadastre peso e dimensões antes de calcular o frete: ${missing.slice(0, 5).join('; ')}${missing.length > 5 ? `; +${missing.length - 5} produto(s)` : ''}.`);
    error.status = 422;
    error.code = 'shipping_dimensions_missing';
    throw error;
  }

  return normalized;
}

function buildProductsFromNormalized(normalized) {
  return normalized.map(({ product, quantity, shipping }) => ({
    id: String(product.sku || product.id || 'produto').slice(0, 100),
    width: Number(shipping.width),
    height: Number(shipping.height),
    length: Number(shipping.length),
    weight: Number(shipping.weight),
    insurance_value: Number(Number(product.preco || 0).toFixed(2)),
    quantity
  }));
}

function buildShipment(rawItems) {
  const normalized = normalizeItems(rawItems);
  const boxSize = orderBoxSize(normalized);
  const box = dimensionsForBox(boxSize);

  if (!box) {
    return {
      payload: { products: buildProductsFromNormalized(normalized) },
      box_size: null
    };
  }

  const weight = normalized.reduce(
    (sum, item) => sum + Number(item.shipping.weight) * Number(item.quantity),
    0
  );
  const insurance = normalized.reduce(
    (sum, item) => sum + Number(item.product.preco || 0) * Number(item.quantity),
    0
  );

  return {
    payload: {
      volumes: [{
        width: Number(box.width),
        height: Number(box.height),
        length: Number(box.length),
        weight: Number(weight.toFixed(3)),
        insurance: Number(insurance.toFixed(2))
      }]
    },
    box_size: box.box_size
  };
}

async function callMelhorEnvio(pathname, body) {
  if (originPostalCode().length !== 8) {
    const error = new Error('Configure o CEP de origem do Melhor Envio no servidor.');
    error.status = 503;
    error.code = 'shipping_origin_missing';
    throw error;
  }

  let token;
  try {
    token = await getAccessToken();
  } catch (error) {
    error.code = error.code || 'shipping_not_configured';
    throw error;
  }

  const response = await fetch(`${baseUrl()}${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': userAgent()
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.message || data?.error || (Array.isArray(data) ? data.map(x => x?.error || x?.message).filter(Boolean).join('; ') : '');
    const error = new Error(detail || `Melhor Envio respondeu com status ${response.status}.`);
    error.status = response.status;
    error.code = 'melhor_envio_error';
    error.data = data;
    throw error;
  }
  return data;
}

function normalizeQuote(entry) {
  if (!entry || entry.error) return null;
  const price = Number(entry.custom_price ?? entry.price);
  const deliveryTime = Number(entry.custom_delivery_time ?? entry.delivery_time);
  if (!Number.isFinite(price) || price < 0) return null;

  return {
    service_id: String(entry.id),
    service_name: String(entry.name || 'Entrega'),
    company_name: String(entry.company?.name || ''),
    company_picture: entry.company?.picture ? String(entry.company.picture) : null,
    price: Number(price.toFixed(2)),
    delivery_time: Number.isFinite(deliveryTime) ? Math.max(0, Math.round(deliveryTime)) : null,
    currency: String(entry.currency || 'R$'),
    discount: Number.isFinite(Number(entry.discount)) ? Number(entry.discount) : 0
  };
}

async function quoteShipping({ postalCode, items }) {
  const destination = digits(postalCode).slice(0, 8);
  if (destination.length !== 8) {
    const error = new Error('Informe um CEP de destino com 8 números.');
    error.status = 400;
    throw error;
  }

  const shipment = buildShipment(items);
  const payload = {
    from: { postal_code: originPostalCode() },
    to: { postal_code: destination },
    ...shipment.payload,
    options: { receipt: false, own_hand: false }
  };

  const result = await callMelhorEnvio('/api/v2/me/shipment/calculate', payload);
  const quotes = (Array.isArray(result) ? result : [])
    .map(normalizeQuote)
    .filter(Boolean)
    .sort((a, b) => a.price - b.price);

  if (!quotes.length) {
    const error = new Error('Nenhuma opção de entrega ficou disponível para este CEP.');
    error.status = 422;
    error.code = 'shipping_no_services';
    throw error;
  }

  return {
    destination_postal_code: destination,
    quotes,
    environment: envMode(),
    box_size: shipment.box_size,
    quoted_at: new Date().toISOString()
  };
}

async function resolveSelectedShipping({ postalCode, serviceId, items }) {
  // Retirada na loja é uma opção local: não há transportadora, cotação nem frete.
  // Retornamos null para que os checkouts existentes mantenham custo R$ 0,00 e
  // não criem o bloco `shipments` no Mercado Pago.
  if (String(serviceId || '').trim().toLowerCase() === 'pickup') return null;

  const result = await quoteShipping({ postalCode, items });
  const selected = result.quotes.find(q => String(q.service_id) === String(serviceId));
  if (!selected) {
    const error = new Error('A opção de frete selecionada não está mais disponível. Calcule o frete novamente.');
    error.status = 409;
    error.code = 'shipping_service_changed';
    throw error;
  }
  return {
    ...selected,
    destination_postal_code: result.destination_postal_code,
    box_size: result.box_size,
    quoted_at: result.quoted_at,
    provider: 'melhor_envio'
  };
}

module.exports = {
  configStatus,
  isConfigured,
  quoteShipping,
  resolveSelectedShipping,
  getShippingData,
  getEffectiveShippingData,
  SHIPPING_PRODUCTS,
  buildShipment
};
