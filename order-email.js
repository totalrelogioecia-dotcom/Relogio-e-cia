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

function isApproved(order) {
  const status = String(order?.status || '').toLowerCase();
  const payment = String(order?.payment_status || '').toLowerCase();
  return status === 'paid' || ['approved', 'processed'].includes(payment);
}

function addressLabel(address) {
  if (!address || typeof address !== 'object') return '';
  const street = [address.street_name, address.street_number].filter(Boolean).join(', ');
  const complement = address.complement ? ` — ${address.complement}` : '';
  const city = [address.neighborhood, address.city_name, address.state_code || address.state_name].filter(Boolean).join(' · ');
  const zip = String(address.zip_code || '').replace(/\D/g, '');
  const cep = zip.length === 8 ? `CEP ${zip.slice(0, 5)}-${zip.slice(5)}` : '';
  return [street ? `${street}${complement}` : '', city, cep].filter(Boolean).join('<br>');
}

function shippingLabel(order) {
  if (String(order?.shipping?.mode || '').toLowerCase() === 'pickup') return 'Retirada na loja';
  return [order?.shipping?.company_name, order?.shipping?.service_name].filter(Boolean).join(' · ') || 'Entrega';
}

function orderHtml(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const itemRows = items.map(item => `<tr><td style="padding:9px 0;border-bottom:1px solid #eee">${esc(item.nome || 'Produto')}</td><td style="padding:9px 0;border-bottom:1px solid #eee;text-align:center">${Number(item.quantidade || 1)}</td><td style="padding:9px 0;border-bottom:1px solid #eee;text-align:right">${brl(Number(item.unit_price || 0) * Number(item.quantidade || 1))}</td></tr>`).join('');
  const shipping = Number(order?.shipping?.price || 0);
  const shippingOriginal = Number(order?.shipping?.original_price || shipping || 0);
  const coupon = order?.coupon?.code ? `<p style="margin:5px 0"><strong>Cupom:</strong> ${esc(order.coupon.code)}</p>` : '';
  const pixDiscount = Number(order?.desconto_pix || 0);
  const address = String(order?.shipping?.mode || '').toLowerCase() === 'pickup' ? '' : addressLabel(order?.payer?.endereco);
  const paymentId = order?.payment_id ? `<p style="margin:5px 0"><strong>ID do pagamento:</strong> ${esc(order.payment_id)}</p>` : '';
  const approvedAt = date(order?.payment_detail?.date_approved || order?.updated_at || order?.created_at);

  return `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;background:#f5f3ef;padding:28px;color:#171717"><div style="max-width:620px;margin:auto;background:#fff;padding:30px;border:1px solid #ddd"><h2 style="margin-top:0">Relógio e Cia</h2><p>Olá, ${esc(order?.payer?.nome || 'cliente')}.</p><p><strong>Seu pagamento foi aprovado e o pedido ${esc(order.id)} está confirmado.</strong></p><div style="background:#f5f3ef;padding:15px 18px;margin:20px 0"><p style="margin:0 0 5px"><strong>Pagamento:</strong> ${esc(paymentLabel(order))}</p><p style="margin:5px 0"><strong>Valor pago:</strong> ${brl(order.total)}</p>${approvedAt ? `<p style="margin:5px 0"><strong>Confirmação:</strong> ${esc(approvedAt)}</p>` : ''}${paymentId}</div><h3 style="margin-top:26px">Resumo do pedido</h3><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding-bottom:8px">Produto</th><th style="text-align:center;padding-bottom:8px">Qtd.</th><th style="text-align:right;padding-bottom:8px">Valor</th></tr></thead><tbody>${itemRows}</tbody></table><div style="margin-top:18px"><p style="margin:5px 0"><strong>Subtotal:</strong> ${brl(order.subtotal)}</p>${pixDiscount ? `<p style="margin:5px 0"><strong>Desconto PIX:</strong> -${brl(pixDiscount)}</p>` : ''}<p style="margin:5px 0"><strong>Frete:</strong> ${shipping === 0 && shippingOriginal > 0 ? `Grátis <span style="color:#777">(original ${brl(shippingOriginal)})</span>` : brl(shipping)}</p>${coupon}<p style="font-size:18px;margin:14px 0 0"><strong>Total: ${brl(order.total)}</strong></p></div><div style="background:#f5f3ef;padding:15px 18px;margin:20px 0"><p style="margin:0 0 5px"><strong>Entrega:</strong> ${esc(shippingLabel(order))}</p>${address ? `<p style="margin:8px 0 0"><strong>Endereço:</strong><br>${address}</p>` : ''}</div><p style="margin-top:24px">A nota fiscal e as informações de envio serão comunicadas separadamente quando estiverem disponíveis.</p><p style="font-size:12px;color:#777;margin-top:24px">Esta mensagem confirma o pagamento registrado para o pedido ${esc(order.id)}. O identificador do pagamento acima permite localizar a operação no histórico do pedido.</p></div></body></html>`;
}

async function sendPaymentApprovedEmail(orderId) {
  const key = String(orderId || '');
  if (!key || inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const orders = read(ORDERS, []);
    const order = orders.find(item => String(item.id) === key);
    if (!order?.payer?.email || !isApproved(order)) return;
    if (order?.notifications?.payment_approved_email_sent_at) return;

    const result = await sendResendEmail({
      to: order.payer.email,
      subject: `Pagamento aprovado — pedido ${order.id} — Relógio e Cia`,
      html: orderHtml(order),
      idempotencyKey: `relogio-payment-approved-${order.id}`
    });

    if (!result.sent) {
      if (result.reason === 'not_configured') {
        console.log('E-mail de pagamento aprovado preparado, aguardando configuração do domínio/Resend.', { orderId: key });
      } else {
        console.warn('E-mail de pagamento aprovado não enviado', { orderId: key, ...result });
      }
      return;
    }

    const currentOrders = read(ORDERS, []);
    const index = currentOrders.findIndex(item => String(item.id) === key);
    if (index >= 0 && !currentOrders[index]?.notifications?.payment_approved_email_sent_at) {
      const sentAt = new Date().toISOString();
      currentOrders[index].notifications = {
        ...(currentOrders[index].notifications || {}),
        payment_approved_email_sent_at: sentAt,
        payment_approved_email_provider_id: result.id || null,
        // Mantido por compatibilidade com dados/testes anteriores ao novo fluxo.
        order_received_email_sent_at: currentOrders[index]?.notifications?.order_received_email_sent_at || sentAt,
        order_received_email_provider_id: currentOrders[index]?.notifications?.order_received_email_provider_id || result.id || null
      };
      fs.writeFileSync(ORDERS, JSON.stringify(currentOrders, null, 2), 'utf8');
      await flushPersistentStore();
    }
    console.log('E-mail de pagamento aprovado enviado', { orderId: key, to: order.payer.email, resend_id: result.id || null });
  } catch (error) {
    console.warn('Falha não bloqueante no e-mail de pagamento aprovado', { orderId: key, message: error.message });
  } finally {
    inFlight.delete(key);
  }
}

function queuePaymentApprovedEmail(orderId) {
  setImmediate(() => { sendPaymentApprovedEmail(String(orderId || '')).catch(() => {}); });
}

// Nome antigo preservado para o bootstrap atual. Agora só envia se o pagamento estiver aprovado.
function queueOrderReceivedEmail(orderId) {
  queuePaymentApprovedEmail(orderId);
}

module.exports = { queuePaymentApprovedEmail, queueOrderReceivedEmail, sendPaymentApprovedEmail, isApproved };
