const fs = require('fs');
const path = require('path');
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

function brl(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function date(value) {
  if (!value) return '';
  try { return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }
  catch { return ''; }
}

function paymentLabel(order) {
  return String(order?.metodo || '').toLowerCase() === 'pix' ? 'PIX' : 'Cartão';
}

function cancellationHtml(order) {
  const cancellation = order?.store_cancellation || {};
  const detail = cancellation.details
    ? `<p style="margin:8px 0 0"><strong>Detalhes:</strong> ${esc(cancellation.details)}</p>`
    : '';
  const refundReference = cancellation.refund_reference
    ? `<p style="margin:5px 0"><strong>Referência do reembolso:</strong> ${esc(cancellation.refund_reference)}</p>`
    : '';
  const paymentId = order.payment_id
    ? `<p style="margin:5px 0"><strong>ID do pagamento:</strong> ${esc(order.payment_id)}</p>`
    : '';
  const mpOrderId = order.mp_order_id
    ? `<p style="margin:5px 0"><strong>ID da ordem Mercado Pago:</strong> ${esc(order.mp_order_id)}</p>`
    : '';
  const refundedAt = cancellation.refunded_at
    ? `<p style="margin:5px 0"><strong>Reembolso confirmado em:</strong> ${esc(date(cancellation.refunded_at))}</p>`
    : '';

  return `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;background:#f5f3ef;padding:28px;color:#171717"><div style="max-width:620px;margin:auto;background:#fff;padding:30px;border:1px solid #ddd"><h2 style="margin-top:0">Relógio e Cia</h2><p>Olá, ${esc(order?.payer?.nome || 'cliente')}.</p><p>Precisamos cancelar o pedido <strong>${esc(order?.id)}</strong> porque não foi possível prosseguir com a venda.</p><div style="background:#f5f3ef;padding:15px 18px;margin:20px 0"><p style="margin:0"><strong>Motivo:</strong> ${esc(cancellation.reason_label || 'Impossibilidade de prosseguir com o pedido')}</p>${detail}</div><h3>Reembolso confirmado</h3><div style="background:#f5f3ef;padding:15px 18px;margin:20px 0"><p style="margin:0 0 5px"><strong>Valor:</strong> ${brl(order.total)}</p><p style="margin:5px 0"><strong>Forma de pagamento:</strong> ${esc(paymentLabel(order))}</p>${paymentId}${mpOrderId}${refundReference}${refundedAt}</div><p><strong>O reembolso integral foi solicitado e confirmado pelo Mercado Pago.</strong> Os identificadores acima permitem localizar a operação. O prazo para o valor aparecer novamente depende da forma de pagamento e da instituição financeira responsável.</p><p>O pedido permanece registrado no seu histórico com o status de cancelamento e reembolso.</p><p style="margin-top:24px">Se precisar de ajuda, fale com a Relógio e Cia pelos canais de atendimento informados no site.</p><p style="font-size:12px;color:#777;margin-top:24px">Mensagem automática referente ao cancelamento do pedido ${esc(order?.id)}.</p></div></body></html>`;
}

async function sendOrderCancellationEmail(orderId) {
  const key = String(orderId || '');
  if (!key || inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const orders = read(ORDERS, []);
    const order = orders.find(item => String(item?.id || '') === key);
    if (!order?.payer?.email || order?.store_cancellation?.status !== 'refunded') return;
    if (order?.notifications?.store_cancellation_email_sent_at) return;

    const result = await sendResendEmail({
      to: order.payer.email,
      subject: `Pedido ${order.id} cancelado e reembolsado — Relógio e Cia`,
      html: cancellationHtml(order),
      idempotencyKey: `relogio-cancellation-${order.id}`
    });

    if (!result.sent) {
      if (result.reason === 'not_configured') {
        console.log('E-mail de cancelamento preparado, aguardando configuração do domínio/Resend.', { orderId: key });
      } else {
        console.warn('E-mail de cancelamento não enviado', { orderId: key, ...result });
      }
      return;
    }

    const currentOrders = read(ORDERS, []);
    const index = currentOrders.findIndex(item => String(item?.id || '') === key);
    if (index >= 0) {
      currentOrders[index].notifications = {
        ...(currentOrders[index].notifications || {}),
        store_cancellation_email_sent_at: new Date().toISOString(),
        store_cancellation_email_provider_id: result.id || null
      };
      fs.writeFileSync(ORDERS, JSON.stringify(currentOrders, null, 2), 'utf8');
      await flushPersistentStore();
    }
    console.log('E-mail de cancelamento enviado', { orderId: key, to: order.payer.email, resend_id: result.id || null });
  } catch (error) {
    console.warn('Falha não bloqueante no e-mail de cancelamento', { orderId: key, message: error.message });
  } finally {
    inFlight.delete(key);
  }
}

function queueOrderCancellationEmail(orderId) {
  setImmediate(() => { sendOrderCancellationEmail(String(orderId || '')).catch(() => {}); });
}

module.exports = { queueOrderCancellationEmail, sendOrderCancellationEmail };
