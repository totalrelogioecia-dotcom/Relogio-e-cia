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

function brl(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function paymentLabel(order) {
  return String(order?.metodo || '').toLowerCase() === 'pix' ? 'PIX' : 'Cartão';
}

function statusLabel(order) {
  const status = String(order?.payment_status || order?.status || '').toLowerCase();
  if (status === 'approved' || status === 'paid') return 'Pagamento aprovado';
  if (status === 'rejected') return 'Pagamento recusado';
  if (status === 'cancelled' || status === 'canceled') return 'Pagamento cancelado';
  return 'Aguardando confirmação do pagamento';
}

function orderHtml(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const itemRows = items.map(item => `<tr><td style="padding:9px 0;border-bottom:1px solid #eee">${esc(item.nome || 'Produto')}</td><td style="padding:9px 0;border-bottom:1px solid #eee;text-align:center">${Number(item.quantidade || 1)}</td><td style="padding:9px 0;border-bottom:1px solid #eee;text-align:right">${brl(Number(item.unit_price || 0) * Number(item.quantidade || 1))}</td></tr>`).join('');
  const shipping = Number(order?.shipping?.price || 0);
  const shippingOriginal = Number(order?.shipping?.original_price || shipping || 0);
  const coupon = order?.coupon?.code ? `<p style="margin:5px 0"><strong>Cupom:</strong> ${esc(order.coupon.code)}</p>` : '';
  const pixDiscount = Number(order?.desconto_pix || 0);

  return `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;background:#f5f3ef;padding:28px;color:#171717"><div style="max-width:620px;margin:auto;background:#fff;padding:30px;border:1px solid #ddd"><h2 style="margin-top:0">Relógio e Cia</h2><p>Olá, ${esc(order?.payer?.nome || 'cliente')}.</p><p>Recebemos o seu pedido <strong>${esc(order.id)}</strong>. Guarde este número para acompanhar qualquer atendimento relacionado à compra.</p><div style="background:#f5f3ef;padding:15px 18px;margin:20px 0"><p style="margin:0 0 5px"><strong>Status:</strong> ${esc(statusLabel(order))}</p><p style="margin:0"><strong>Pagamento:</strong> ${esc(paymentLabel(order))}</p></div><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding-bottom:8px">Produto</th><th style="text-align:center;padding-bottom:8px">Qtd.</th><th style="text-align:right;padding-bottom:8px">Valor</th></tr></thead><tbody>${itemRows}</tbody></table><div style="margin-top:18px"><p style="margin:5px 0"><strong>Subtotal:</strong> ${brl(order.subtotal)}</p>${pixDiscount ? `<p style="margin:5px 0"><strong>Desconto PIX:</strong> -${brl(pixDiscount)}</p>` : ''}<p style="margin:5px 0"><strong>Frete:</strong> ${shipping === 0 && shippingOriginal > 0 ? `Grátis <span style="color:#777">(original ${brl(shippingOriginal)})</span>` : brl(shipping)}</p>${coupon}<p style="font-size:18px;margin:14px 0 0"><strong>Total: ${brl(order.total)}</strong></p></div><p style="margin-top:24px">Se precisar de ajuda, responda pelos canais de atendimento informados no site. Para trocas, devoluções ou estornos, use a página específica da Relógio e Cia.</p><p style="font-size:12px;color:#777;margin-top:24px">Este e-mail confirma o recebimento do pedido. A aprovação do pagamento é informada separadamente pelo meio de pagamento e pelo status do pedido.</p></div></body></html>`;
}

async function sendOrderReceivedEmail(orderId) {
  if (!orderId || inFlight.has(orderId)) return;
  inFlight.add(orderId);
  try {
    const apiKey = String(process.env.RESEND_API_KEY || '').trim();
    const from = String(process.env.RESEND_FROM || '').trim();
    if (!apiKey || !from) {
      console.log('E-mail de pedido preparado, aguardando configuração do domínio/Resend.', { orderId });
      return;
    }

    const orders = read(ORDERS, []);
    const order = orders.find(item => String(item.id) === String(orderId));
    if (!order?.payer?.email) return;
    if (order?.notifications?.order_received_email_sent_at) return;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [String(order.payer.email).trim().toLowerCase()],
        subject: `Pedido recebido ${order.id} — Relógio e Cia`,
        html: orderHtml(order)
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn('E-mail de confirmação do pedido não enviado', {
        orderId,
        statusCode: response.status,
        message: data?.message || data?.name || 'erro do provedor'
      });
      return;
    }

    const currentOrders = read(ORDERS, []);
    const index = currentOrders.findIndex(item => String(item.id) === String(orderId));
    if (index >= 0) {
      currentOrders[index].notifications = {
        ...(currentOrders[index].notifications || {}),
        order_received_email_sent_at: new Date().toISOString(),
        order_received_email_provider_id: data?.id || null
      };
      fs.writeFileSync(ORDERS, JSON.stringify(currentOrders, null, 2), 'utf8');
      await flushPersistentStore();
    }
    console.log('E-mail de pedido recebido enviado', { orderId, to: order.payer.email, resend_id: data?.id || null });
  } catch (error) {
    console.warn('Falha não bloqueante no e-mail de pedido recebido', { orderId, message: error.message });
  } finally {
    inFlight.delete(orderId);
  }
}

function queueOrderReceivedEmail(orderId) {
  setImmediate(() => { sendOrderReceivedEmail(String(orderId || '')).catch(() => {}); });
}

module.exports = { queueOrderReceivedEmail };

