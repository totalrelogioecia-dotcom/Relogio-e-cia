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

function signature(invoice) {
  return crypto.createHash('sha256')
    .update(`${invoice?.status || ''}|${invoice?.number || ''}|${invoice?.access_key || ''}`)
    .digest('hex');
}

function invoiceAttachments(invoice) {
  if (!Array.isArray(invoice?.attachments)) return [];
  return invoice.attachments
    .filter(item => item?.filename && item?.content)
    .slice(0, 5)
    .map(item => ({ filename: item.filename, content: item.content }));
}

function invoiceHtml(order) {
  const invoice = order.invoice || {};
  const hasFiles = invoiceAttachments(invoice).length > 0;
  return `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;background:#f5f3ef;padding:28px;color:#171717"><div style="max-width:620px;margin:auto;background:#fff;padding:30px;border:1px solid #ddd"><h2 style="margin-top:0">Relógio e Cia</h2><p>Olá, ${esc(order?.payer?.nome || 'cliente')}.</p><p>A nota fiscal do pedido <strong>${esc(order.id)}</strong> foi registrada.</p><div style="background:#f5f3ef;padding:15px 18px;margin:20px 0"><p style="margin:0 0 7px"><strong>Número da NF-e:</strong> ${esc(invoice.number)}</p><p style="margin:0;word-break:break-all"><strong>Chave de acesso:</strong> ${esc(invoice.access_key)}</p></div>${hasFiles ? '<p>Os arquivos fiscais cadastrados no pedido seguem anexados a este e-mail.</p>' : '<p>Os dados da NF-e estão acima. Quando o painel possuir arquivos fiscais anexados ao pedido, eles também poderão ser enviados junto desta mensagem.</p>'}<p>Guarde este e-mail e a chave de acesso para consulta da nota.</p><p style="font-size:12px;color:#777;margin-top:24px">Mensagem automática referente à nota fiscal do pedido ${esc(order.id)}.</p></div></body></html>`;
}

async function sendInvoiceEmail(orderId) {
  const key = String(orderId || '');
  if (!key || inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const orders = read(ORDERS, []);
    const order = orders.find(item => String(item?.id || '') === key);
    const invoice = order?.invoice || null;
    if (!order?.payer?.email || !invoice || String(invoice.status || '').toLowerCase() !== 'emitted') return;
    if (!invoice.number || String(invoice.access_key || '').replace(/\D/g, '').length !== 44) return;

    const currentSignature = signature(invoice);
    if (order?.notifications?.invoice_email_signature === currentSignature) return;

    const result = await sendResendEmail({
      to: order.payer.email,
      subject: `Nota fiscal do pedido ${order.id} — Relógio e Cia`,
      html: invoiceHtml(order),
      attachments: invoiceAttachments(invoice),
      idempotencyKey: `relogio-invoice-${order.id}-${currentSignature.slice(0, 24)}`
    });

    if (!result.sent) {
      if (result.reason === 'not_configured') {
        console.log('E-mail de NF-e preparado, aguardando configuração do domínio/Resend.', { orderId: key });
      } else {
        console.warn('E-mail de NF-e não enviado', { orderId: key, ...result });
      }
      return;
    }

    const currentOrders = read(ORDERS, []);
    const index = currentOrders.findIndex(item => String(item?.id || '') === key);
    if (index >= 0) {
      currentOrders[index].notifications = {
        ...(currentOrders[index].notifications || {}),
        invoice_email_sent_at: new Date().toISOString(),
        invoice_email_provider_id: result.id || null,
        invoice_email_signature: currentSignature
      };
      fs.writeFileSync(ORDERS, JSON.stringify(currentOrders, null, 2), 'utf8');
      await flushPersistentStore();
    }
    console.log('E-mail de NF-e enviado', { orderId: key, to: order.payer.email, resend_id: result.id || null });
  } catch (error) {
    console.warn('Falha não bloqueante no e-mail de NF-e', { orderId: key, message: error.message });
  } finally {
    inFlight.delete(key);
  }
}

function queueInvoiceEmail(orderId) {
  setImmediate(() => { sendInvoiceEmail(String(orderId || '')).catch(() => {}); });
}

module.exports = { queueInvoiceEmail, sendInvoiceEmail };
