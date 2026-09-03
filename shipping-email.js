const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { flushPersistentStore } = require('./persistent-store');
const { sendResendEmail } = require('./resend-client');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const ORDERS = path.join(DATA, 'orders.json');
const inFlight = new Set();

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
}

function signature(fulfillment) {
  return crypto.createHash('sha256')
    .update([
      fulfillment?.status || '',
      fulfillment?.carrier || '',
      fulfillment?.tracking_code || '',
      fulfillment?.tracking_url || '',
      fulfillment?.estimated_delivery || '',
      fulfillment?.posted_at || ''
    ].join('|'))
    .digest('hex');
}

function date(value) {
  if (!value) return '';
  try { return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }
  catch { return String(value); }
}

function shipmentHtml(order) {
  const fulfillment = order.fulfillment || {};
  const pickup = fulfillment.status === 'ready_for_pickup';
  const trackingLink = fulfillment.tracking_url
    ? `<p style="margin:18px 0"><a href="${esc(fulfillment.tracking_url)}" style="display:inline-block;background:#171717;color:#fff;padding:12px 18px;text-decoration:none">Acompanhar entrega</a></p>`
    : '';
  const tracking = fulfillment.tracking_code ? `<p style="margin:5px 0"><strong>Código de rastreamento:</strong> ${esc(fulfillment.tracking_code)}</p>` : '';
  const carrier = fulfillment.carrier ? `<p style="margin:5px 0"><strong>Transportadora:</strong> ${esc(fulfillment.carrier)}</p>` : '';
  const estimate = fulfillment.estimated_delivery ? `<p style="margin:5px 0"><strong>Previsão informada:</strong> ${esc(fulfillment.estimated_delivery)}</p>` : '';
  const posted = fulfillment.posted_at ? `<p style="margin:5px 0"><strong>Atualizado em:</strong> ${esc(date(fulfillment.posted_at))}</p>` : '';

  return `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;background:#f5f3ef;padding:28px;color:#171717"><div style="max-width:620px;margin:auto;background:#fff;padding:30px;border:1px solid #ddd"><h2 style="margin-top:0">Relógio e Cia</h2><p>Olá, ${esc(order?.payer?.nome || 'cliente')}.</p><p><strong>${pickup ? 'Seu pedido está pronto para retirada na loja.' : 'Seu pedido foi enviado.'}</strong></p><p>Pedido <strong>${esc(order.id)}</strong></p><div style="background:#f5f3ef;padding:15px 18px;margin:20px 0">${carrier}${tracking}${estimate}${posted}${!carrier && !tracking && !estimate && !posted ? '<p style="margin:0">A atualização de envio foi registrada no pedido.</p>' : ''}</div>${trackingLink}${pickup ? '<p>Leve um documento de identificação para facilitar a retirada. Se outra pessoa for retirar, confirme previamente com a loja pelos canais de atendimento.</p>' : '<p>O prazo de entrega pode sofrer atualização pela transportadora. Use o rastreamento acima quando disponível.</p>'}<p style="font-size:12px;color:#777;margin-top:24px">Mensagem automática referente ao pedido ${esc(order.id)}.</p></div></body></html>`;
}

async function sendShippingEmail(orderId) {
  const key = String(orderId || '');
  if (!key || inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const orders = read(ORDERS, []);
    const order = orders.find(item => String(item?.id || '') === key);
    const fulfillment = order?.fulfillment || null;
    if (!order?.payer?.email || !fulfillment) return;
    if (!['shipped', 'ready_for_pickup'].includes(String(fulfillment.status || '').toLowerCase())) return;

    const currentSignature = signature(fulfillment);
    if (order?.notifications?.shipping_email_signature === currentSignature) return;

    const result = await sendResendEmail({
      to: order.payer.email,
      subject: fulfillment.status === 'ready_for_pickup'
        ? `Pedido ${order.id} pronto para retirada — Relógio e Cia`
        : `Seu pedido ${order.id} foi enviado — Relógio e Cia`,
      html: shipmentHtml(order),
      idempotencyKey: `relogio-shipping-${order.id}-${currentSignature.slice(0, 24)}`
    });

    if (!result.sent) {
      if (result.reason === 'not_configured') {
        console.log('E-mail de envio preparado, aguardando configuração do domínio/Resend.', { orderId: key });
      } else {
        console.warn('E-mail de envio não enviado', { orderId: key, ...result });
      }
      return;
    }

    const currentOrders = read(ORDERS, []);
    const index = currentOrders.findIndex(item => String(item?.id || '') === key);
    if (index >= 0) {
      currentOrders[index].notifications = {
        ...(currentOrders[index].notifications || {}),
        shipping_email_sent_at: new Date().toISOString(),
        shipping_email_provider_id: result.id || null,
        shipping_email_signature: currentSignature
      };
      fs.writeFileSync(ORDERS, JSON.stringify(currentOrders, null, 2), 'utf8');
      await flushPersistentStore();
    }
    console.log('E-mail de envio enviado', { orderId: key, to: order.payer.email, resend_id: result.id || null });
  } catch (error) {
    console.warn('Falha não bloqueante no e-mail de envio', { orderId: key, message: error.message });
  } finally {
    inFlight.delete(key);
  }
}

function queueShippingEmail(orderId) {
  setImmediate(() => { sendShippingEmail(String(orderId || '')).catch(() => {}); });
}

module.exports = { queueShippingEmail, sendShippingEmail };
