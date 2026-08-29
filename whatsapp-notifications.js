const fs = require('fs');
const path = require('path');
const { flushPersistentStore } = require('./persistent-store');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const ORDERS = path.join(DATA, 'orders.json');
const USERS = path.join(DATA, 'users.json');
const inFlight = new Set();

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeBrazilPhone(value) {
  const raw = value && typeof value === 'object'
    ? `${value.area_code || ''}${value.number || ''}`
    : value;
  const number = digits(raw);
  if (!number) return null;
  if ((number.length === 12 || number.length === 13) && number.startsWith('55')) return number;
  if (number.length === 10 || number.length === 11) return `55${number}`;
  return null;
}

function firstName(value) {
  return String(value || 'Cliente').trim().split(/\s+/)[0].slice(0, 60) || 'Cliente';
}

function brl(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function whatsappEnabled() {
  return String(process.env.WHATSAPP_NOTIFICATIONS_ENABLED || '').trim().toLowerCase() === 'true';
}

function config() {
  const graphVersion = String(process.env.WHATSAPP_GRAPH_VERSION || '').trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const language = String(process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'pt_BR').trim() || 'pt_BR';
  return {
    graphVersion,
    phoneNumberId,
    accessToken,
    language,
    ready: whatsappEnabled()
      && /^v\d+\.\d+$/.test(graphVersion)
      && Boolean(phoneNumberId)
      && Boolean(accessToken)
  };
}

function findUserForOrder(order) {
  const email = String(order?.payer?.email || '').trim().toLowerCase();
  if (!email) return null;
  return read(USERS, []).find(user => String(user?.email || '').trim().toLowerCase() === email) || null;
}

function userOptedIn(user) {
  return user?.whatsapp_opt_in === true;
}

function buildTemplatePayload({ to, templateName, language = 'pt_BR', parameters = [] }) {
  return {
    messaging_product: 'whatsapp',
    to: String(to),
    type: 'template',
    template: {
      name: String(templateName),
      language: { code: String(language) },
      components: [{
        type: 'body',
        parameters: parameters.map(value => ({ type: 'text', text: String(value ?? '') }))
      }]
    }
  };
}

async function sendTemplate({ to, templateName, parameters }) {
  const settings = config();
  if (!settings.ready) return { sent: false, reason: 'not_configured' };
  if (!templateName) return { sent: false, reason: 'template_missing' };

  const response = await fetch(
    `https://graph.facebook.com/${encodeURIComponent(settings.graphVersion)}/${encodeURIComponent(settings.phoneNumberId)}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildTemplatePayload({
        to,
        templateName,
        language: settings.language,
        parameters
      })),
      signal: AbortSignal.timeout(15000)
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || `WhatsApp respondeu HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  return {
    sent: true,
    provider_id: data?.messages?.[0]?.id ? String(data.messages[0].id) : null
  };
}

async function markNotification(orderId, patch) {
  const orders = read(ORDERS, []);
  const index = orders.findIndex(order => String(order?.id || '') === String(orderId));
  if (index < 0) return;
  orders[index].notifications = {
    ...(orders[index].notifications || {}),
    ...patch
  };
  fs.writeFileSync(ORDERS, JSON.stringify(orders, null, 2), 'utf8');
  await flushPersistentStore();
}

async function sendOrderReceivedWhatsApp(orderId) {
  const key = `received:${orderId}`;
  if (!orderId || inFlight.has(key)) return;
  inFlight.add(key);
  try {
    if (!whatsappEnabled()) return;
    const order = read(ORDERS, []).find(item => String(item?.id || '') === String(orderId));
    if (!order || order?.notifications?.order_received_whatsapp_sent_at) return;

    const user = findUserForOrder(order);
    if (!userOptedIn(user)) {
      console.log('WhatsApp de pedido aguardando consentimento do cliente.', { orderId });
      return;
    }

    const to = normalizeBrazilPhone(user?.telefone || order?.payer?.telefone);
    if (!to) {
      console.warn('WhatsApp de pedido não enviado: telefone inválido.', { orderId });
      return;
    }

    const templateName = String(process.env.WHATSAPP_TEMPLATE_ORDER_RECEIVED || '').trim();
    const result = await sendTemplate({
      to,
      templateName,
      parameters: [firstName(user?.nome || order?.payer?.nome), order.id, brl(order.total)]
    });
    if (!result.sent) {
      console.log('WhatsApp de pedido preparado, aguardando configuração da Meta.', { orderId, reason: result.reason });
      return;
    }

    await markNotification(orderId, {
      order_received_whatsapp_sent_at: new Date().toISOString(),
      order_received_whatsapp_provider_id: result.provider_id
    });
    console.log('WhatsApp de pedido recebido enviado.', { orderId, provider_id: result.provider_id });
  } catch (error) {
    console.warn('Falha não bloqueante no WhatsApp de pedido recebido.', { orderId, message: error.message });
  } finally {
    inFlight.delete(key);
  }
}

async function sendOrderCancellationWhatsApp(orderId) {
  const key = `cancelled:${orderId}`;
  if (!orderId || inFlight.has(key)) return;
  inFlight.add(key);
  try {
    if (!whatsappEnabled()) return;
    const order = read(ORDERS, []).find(item => String(item?.id || '') === String(orderId));
    if (!order || order?.store_cancellation?.status !== 'refunded') return;
    if (order?.notifications?.store_cancellation_whatsapp_sent_at) return;

    const user = findUserForOrder(order);
    if (!userOptedIn(user)) {
      console.log('WhatsApp de cancelamento aguardando consentimento do cliente.', { orderId });
      return;
    }

    const to = normalizeBrazilPhone(user?.telefone || order?.payer?.telefone);
    if (!to) {
      console.warn('WhatsApp de cancelamento não enviado: telefone inválido.', { orderId });
      return;
    }

    const templateName = String(process.env.WHATSAPP_TEMPLATE_ORDER_CANCELLED || '').trim();
    const result = await sendTemplate({
      to,
      templateName,
      parameters: [order.id, order?.store_cancellation?.reason_label || 'Cancelamento da loja']
    });
    if (!result.sent) {
      console.log('WhatsApp de cancelamento preparado, aguardando configuração da Meta.', { orderId, reason: result.reason });
      return;
    }

    await markNotification(orderId, {
      store_cancellation_whatsapp_sent_at: new Date().toISOString(),
      store_cancellation_whatsapp_provider_id: result.provider_id
    });
    console.log('WhatsApp de cancelamento enviado.', { orderId, provider_id: result.provider_id });
  } catch (error) {
    console.warn('Falha não bloqueante no WhatsApp de cancelamento.', { orderId, message: error.message });
  } finally {
    inFlight.delete(key);
  }
}

function queueOrderReceivedWhatsApp(orderId) {
  setImmediate(() => { sendOrderReceivedWhatsApp(String(orderId || '')).catch(() => {}); });
}

function queueOrderCancellationWhatsApp(orderId) {
  setImmediate(() => { sendOrderCancellationWhatsApp(String(orderId || '')).catch(() => {}); });
}

module.exports = {
  normalizeBrazilPhone,
  userOptedIn,
  buildTemplatePayload,
  queueOrderReceivedWhatsApp,
  queueOrderCancellationWhatsApp,
  sendOrderReceivedWhatsApp,
  sendOrderCancellationWhatsApp
};
