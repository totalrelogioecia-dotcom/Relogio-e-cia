const fs = require('fs');
const path = require('path');
const { flushPersistentStore } = require('./persistent-store');

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

function cancellationHtml(order) {
  const cancellation = order?.store_cancellation || {};
  const detail = cancellation.details
    ? `<p style="margin:8px 0 0"><strong>Detalhes:</strong> ${esc(cancellation.details)}</p>`
    : '';

  return `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;background:#f5f3ef;padding:28px;color:#171717"><div style="max-width:620px;margin:auto;background:#fff;padding:30px;border:1px solid #ddd"><h2 style="margin-top:0">Relógio e Cia</h2><p>Olá, ${esc(order?.payer?.nome || 'cliente')}.</p><p>Precisamos cancelar o pedido <strong>${esc(order?.id)}</strong> porque não foi possível prosseguir com a venda.</p><div style="background:#f5f3ef;padding:15px 18px;margin:20px 0"><p style="margin:0"><strong>Motivo:</strong> ${esc(cancellation.reason_label || 'Impossibilidade de prosseguir com o pedido')}</p>${detail}</div><p><strong>O reembolso integral foi solicitado e confirmado pelo Mercado Pago.</strong> O prazo para o valor aparecer novamente depende da forma de pagamento e da instituição financeira responsável.</p><p>O pedido permanece registrado no seu histórico com o status de cancelamento e reembolso.</p><p style="margin-top:24px">Se precisar de ajuda, fale com a Relógio e Cia pelos canais de atendimento informados no site.</p><p style="font-size:12px;color:#777;margin-top:24px">Mensagem automática referente ao cancelamento do pedido ${esc(order?.id)}.</p></div></body></html>`;
}

async function sendOrderCancellationEmail(orderId) {
  if (!orderId || inFlight.has(orderId)) return;
  inFlight.add(orderId);
  try {
    const apiKey = String(process.env.RESEND_API_KEY || '').trim();
    const from = String(process.env.RESEND_FROM || '').trim();
    if (!apiKey || !from) {
      console.log('E-mail de cancelamento preparado, aguardando configuração do domínio/Resend.', { orderId });
      return;
    }

    const orders = read(ORDERS, []);
    const order = orders.find(item => String(item?.id || '') === String(orderId));
    if (!order?.payer?.email || order?.store_cancellation?.status !== 'refunded') return;
    if (order?.notifications?.store_cancellation_email_sent_at) return;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [String(order.payer.email).trim().toLowerCase()],
        subject: `Pedido ${order.id} cancelado e reembolsado — Relógio e Cia`,
        html: cancellationHtml(order)
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn('E-mail de cancelamento não enviado', {
        orderId,
        statusCode: response.status,
        message: data?.message || data?.name || 'erro do provedor'
      });
      return;
    }

    const currentOrders = read(ORDERS, []);
    const index = currentOrders.findIndex(item => String(item?.id || '') === String(orderId));
    if (index >= 0) {
      currentOrders[index].notifications = {
        ...(currentOrders[index].notifications || {}),
        store_cancellation_email_sent_at: new Date().toISOString(),
        store_cancellation_email_provider_id: data?.id || null
      };
      fs.writeFileSync(ORDERS, JSON.stringify(currentOrders, null, 2), 'utf8');
      await flushPersistentStore();
    }
    console.log('E-mail de cancelamento enviado', { orderId, to: order.payer.email, resend_id: data?.id || null });
  } catch (error) {
    console.warn('Falha não bloqueante no e-mail de cancelamento', { orderId, message: error.message });
  } finally {
    inFlight.delete(orderId);
  }
}

function queueOrderCancellationEmail(orderId) {
  setImmediate(() => { sendOrderCancellationEmail(String(orderId || '')).catch(() => {}); });
}

module.exports = { queueOrderCancellationEmail };
