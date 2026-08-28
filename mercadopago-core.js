const {
  MercadoPagoConfig,
  Preference,
  Payment,
  WebhookSignatureValidator
} = require('mercadopago');

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function mercadoPagoEnvironment() {
  const value = String(process.env.MERCADOPAGO_ENV || 'production').trim().toLowerCase();
  return value === 'test' ? 'test' : 'production';
}

function accessToken() {
  const value = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!value) {
    const error = new Error('MERCADOPAGO_ACCESS_TOKEN não configurado.');
    error.status = 503;
    throw error;
  }
  return value;
}

function publicKey() {
  return String(process.env.MERCADOPAGO_PUBLIC_KEY || '').trim();
}

function webhookSecret() {
  return String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();
}

function publicBaseUrl() {
  const value = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (!value.startsWith('https://')) {
    const error = new Error('PUBLIC_URL precisa estar configurada com HTTPS.');
    error.status = 503;
    throw error;
  }
  return value;
}

function statementDescriptor() {
  return String(process.env.MERCADOPAGO_STATEMENT_DESCRIPTOR || 'RELOGIOECIA')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 13) || 'RELOGIOECIA';
}

function deviceSessionId(value) {
  const id = String(value ?? '').trim();
  // O Mercado Pago documenta o Device ID como valor opaco e não publica um
  // alfabeto/formato para ele. Preserve o valor recebido, limitando apenas o
  // tamanho transportado pela aplicação.
  return id ? id.slice(0, 1024) : null;
}

function splitName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean);
  const first = (parts.shift() || 'Cliente').slice(0, 80);
  const last = parts.join(' ').slice(0, 120);
  return { first, last };
}

function preferencePayer(payer) {
  const name = splitName(payer?.nome);
  const result = {
    name: name.first,
    email: String(payer?.email || '').trim().toLowerCase().slice(0, 180)
  };
  if (name.last) result.surname = name.last;

  const areaCode = digits(payer?.telefone?.area_code).slice(0, 4);
  const phoneNumber = digits(payer?.telefone?.number).slice(0, 15);
  if (areaCode && phoneNumber) {
    result.phone = { area_code: areaCode, number: phoneNumber };
  }

  const identificationType = String(payer?.identificacao?.type || '')
    .trim()
    .toUpperCase()
    .slice(0, 20);
  const identificationNumber = digits(payer?.identificacao?.number).slice(0, 30);
  if (identificationType && identificationNumber) {
    result.identification = {
      type: identificationType,
      number: identificationNumber
    };
  }

  const address = payer?.endereco || {};
  const zipCode = digits(address.zip_code).slice(0, 8);
  const streetName = String(address.street_name || '').trim().slice(0, 120);
  const streetNumber = String(address.street_number || '').trim().slice(0, 20);
  if (zipCode.length === 8 && streetName && streetNumber) {
    result.address = {
      zip_code: zipCode,
      street_name: streetName,
      street_number: streetNumber
    };
  }

  const dateCreated = String(payer?.date_created || '').trim();
  if (dateCreated) result.date_created = dateCreated;

  return result;
}

function paymentPayer(payer) {
  const name = splitName(payer?.nome);
  const result = {
    email: String(payer?.email || '').trim().toLowerCase().slice(0, 180),
    first_name: name.first
  };
  if (name.last) result.last_name = name.last;

  const identificationType = String(payer?.identificacao?.type || '')
    .trim()
    .toUpperCase()
    .slice(0, 20);
  const identificationNumber = digits(payer?.identificacao?.number).slice(0, 30);
  if (identificationType && identificationNumber) {
    result.identification = {
      type: identificationType,
      number: identificationNumber
    };
  }

  const areaCode = digits(payer?.telefone?.area_code).slice(0, 4);
  const phoneNumber = digits(payer?.telefone?.number).slice(0, 15);
  if (areaCode && phoneNumber) {
    result.phone = { area_code: areaCode, number: phoneNumber };
  }

  return result;
}

function receiverAddress(payer) {
  const address = payer?.endereco || {};
  const zipCode = digits(address.zip_code).slice(0, 8);
  const streetName = String(address.street_name || '').trim().slice(0, 120);
  const streetNumber = Number(String(address.street_number || '').match(/\d+/)?.[0] || 0);
  if (zipCode.length !== 8 || !streetName || !streetNumber) return undefined;

  return {
    zip_code: zipCode,
    street_name: streetName,
    city_name: String(address.city_name || '').trim().slice(0, 120),
    state_name: String(address.state_code || address.state_name || '').trim().slice(0, 120),
    street_number: streetNumber,
    country_name: 'Brasil'
  };
}

function requestOptions({ idempotencyKey, deviceId, timeout, maxRetries } = {}) {
  const options = {};
  if (idempotencyKey) options.idempotencyKey = String(idempotencyKey);
  const sessionId = deviceSessionId(deviceId);
  if (sessionId) options.meliSessionId = sessionId;
  if (Number.isFinite(Number(timeout))) options.timeout = Number(timeout);
  if (Number.isFinite(Number(maxRetries))) options.maxRetries = Number(maxRetries);
  return options;
}

function clients() {
  const client = new MercadoPagoConfig({
    accessToken: accessToken(),
    options: {
      timeout: 10000,
      maxRetries: 2
    }
  });

  return {
    preference: new Preference(client),
    payment: new Payment(client)
  };
}

function paymentSafe(payment) {
  return {
    id: payment?.id ? String(payment.id) : null,
    status: payment?.status ? String(payment.status) : null,
    status_detail: payment?.status_detail ? String(payment.status_detail) : null,
    payment_method_id: payment?.payment_method_id ? String(payment.payment_method_id) : null,
    payment_type_id: payment?.payment_type_id ? String(payment.payment_type_id) : null,
    operation_type: payment?.operation_type ? String(payment.operation_type) : null,
    transaction_amount: Number.isFinite(Number(payment?.transaction_amount))
      ? Number(payment.transaction_amount)
      : null,
    currency_id: payment?.currency_id ? String(payment.currency_id) : null,
    installments: Number.isFinite(Number(payment?.installments))
      ? Number(payment.installments)
      : null,
    issuer_id: payment?.issuer_id ? String(payment.issuer_id) : null,
    external_reference: payment?.external_reference ? String(payment.external_reference) : null,
    date_created: payment?.date_created ? String(payment.date_created) : null,
    date_approved: payment?.date_approved ? String(payment.date_approved) : null,
    date_last_updated: payment?.date_last_updated ? String(payment.date_last_updated) : null,
    live_mode: typeof payment?.live_mode === 'boolean' ? payment.live_mode : null
  };
}

function safeErrorData(error) {
  const source = error?.cause || error?.data || error?.api_response?.response || null;
  if (!source || typeof source !== 'object') return source;
  try {
    return JSON.parse(JSON.stringify(source, (key, value) => {
      if (/token|authorization|secret|password|card|cvv|security_code/i.test(key)) {
        return '[oculto]';
      }
      return value;
    }));
  } catch {
    return String(source);
  }
}

function errorStatus(error) {
  return Number(
    error?.status ||
    error?.statusCode ||
    error?.api_response?.status ||
    error?.cause?.status
  ) || 502;
}

module.exports = {
  WebhookSignatureValidator,
  clients,
  deviceSessionId,
  digits,
  errorStatus,
  mercadoPagoEnvironment,
  paymentPayer,
  paymentSafe,
  preferencePayer,
  publicBaseUrl,
  publicKey,
  receiverAddress,
  requestOptions,
  safeErrorData,
  statementDescriptor,
  webhookSecret
};
