const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { flushPersistentStore } = require('./persistent-store');
const { sendResendEmail } = require('./resend-client');
const { getInvoiceEmailAttachments } = require('./invoice-files');

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

function signature(invoice, files = []) {
  const filePart = files.length
    ? `|${files.map(item => `${item.kind}:${item.sha256 || ''}`).sort().join('|')}`
    : '';
  return crypto.createHash('sha256')
    .update(`${invoice?.status || ''}|${invoice?.number || ''}|${invoice?.access_key || ''}${filePart}`)
    .digest('hex');
}

function invoiceHtml(order, files = []) {
  const invoice = order.invoice || {};
  const hasFiles = files.length > 0;
  const fileLabels = files.map(file => file.kind === 'danfe_pdf' ? 'DANFE em PDF' : 'XML da NF-e');
  const filesText = hasFiles
    ? `<p>Os arquivos fiscais seguem anexados a este e-mail: <strong>${esc(fileLabels.join(' e '))}</strong>.</p>`
    : '<p>Os dados da NF-e estão acima. Se os arquivos fiscais forem anexados posteriormente no painel, o sistema poderá enviar uma versão atualizada desta mensagem.</p>';
  return `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;background:#f5f3ef;padding:28px;color:#171717"><div style="max-width:620px;margin:auto;background:#fff;padding:30px;border:1px solid #ddd"><h2 style="margin-top:0">Relógio e Cia</h2><p>Olá, ${esc(order?.payer?.nome || 'cliente')}.</p><p>A nota fiscal do pedido <strong>${esc(order.id)}</strong> foi registrada.</p><div style="background:#f5f3ef;padding:15px 18px;margin:20px 0"><p style="margin:0 0 7px"><strong>Número da NF-e:</strong> ${esc(invoice.number)}</p><p style="margin:0;word-break:break-all"><strong>Chave de acesso:</strong> ${esc(invoice.access_key)}</p></div>${filesText}<p>Guarde este e-mail, os arquivos e a chave de acesso para consulta da nota.</p><p style="font-size:12px;color:#777;margin-top:24px">Mensagem automática referente à nota fiscal do pedido ${esc(order.id)}.</p></div></body></html>`;
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

    const fiscalFiles = getInvoiceEmailAttachments(key);
    const currentSignature = signature(invoice, fiscalFiles);
    if (order?.notifications?.invoice_email_signature === currentSignature) return;

    const result = await sendResendEmail({
      to: order.payer.email,
      subject: `Nota fiscal do pedido ${order.id} — Relógio e Cia`,
      html: invoiceHtml(order, fiscalFiles),
      attachments: fiscalFiles.map(file => ({ filename: file.filename, content: file.content })),
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
    console.log('E-mail de NF-e enviado', {
      orderId: key,
      to: order.payer.email,
      attachments: fiscalFiles.map(file => file.kind),
      resend_id: result.id || null
    });
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
