function normalizePlace(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function pickupAllowed(payer) {
  const address = payer?.endereco || {};
  const city = normalizePlace(address.city_name);
  const state = normalizePlace(address.state_code || address.state_name);
  return city === 'porto alegre' && (state === 'rs' || state === 'rio grande do sul');
}

function assertPickupAllowed(payer) {
  if (pickupAllowed(payer)) return true;
  const error = new Error('A retirada na loja está disponível somente para endereços em Porto Alegre/RS.');
  error.status = 409;
  error.code = 'pickup_outside_porto_alegre';
  throw error;
}

module.exports = { normalizePlace, pickupAllowed, assertPickupAllowed };
