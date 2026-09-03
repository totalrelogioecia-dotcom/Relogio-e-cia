const fs = require('fs');
const path = require('path');
const { flushPersistentStore } = require('./persistent-store');
const { sendResendEmail } = require('./resend-client');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const REQUESTS = path.join(DATA, 'return-requests.json');
const inFlight = new Set();

const TYPE_LABELS = {
  troca: 'Troca',
  devolucao: 'Devolução',
  estorno: 'Estorno',
  garantia: 'Garantia',
  outro: 'Atendimento'
};
const STATUS_LABELS = {
  recebida: 'Recebida',
  em_analise: 'Em análise',
  aguardando_cliente: 'Aguardando informações do cliente',
  aprovada: 'Aprovada',
  concluida: 'Concluída',
  recusada: 'Não aprovada'
};
const IMPORTANT_STATUS = new Set(['aguardando_cliente', 'aprovada', 'concluida', 'recusada']);

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
}

function typeLabel(value) {
  return TYPE_LABELS[String(value || '').toLowerCase()] || 'Atendimento';
}

function statusLabel(value) {
  return STATUS_LABELS[String(value || '').toLowerCase()] || String(value || 'Atualização');
}

function receivedHtml(item) {
  return `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;background:#f5f3ef;padding:28px;color:#171717"><div style="max-width:620px;margin:auto;background:#fff;padding:30px;border:1px solid #ddd"><h2 style="margin-top:0">Relógio e Cia</h2><p>Olá, ${esc(item.customer_name || 'cliente')}.</p><p>Recebemos sua solicitação de <strong>${esc(typeLabel(item.type))}</strong> referente ao pedido <strong>${esc(item.order_id)}</strong>.</p><div style="background:#f5f3ef;padding:15px 18px;margin:20px 0"><p style="margin:0 0 7px"><strong>Protocolo:</strong> ${esc(item.protocol)}</p><p style="margin:5px 0"><strong>Motivo:</strong> ${esc(item.reason)}</p><p style="margin:5px 0"><strong>Status:</strong> Recebida</p></div><p><strong>Nossa equipe fará a análise inicial em até 2 dias úteis.</strong> Se precisarmos de fotos, documentos ou outras informações, avisaremos por e-mail.</p><p>Guarde o protocolo acima para acompanhar o atendimento.</p><p style="font-size:12px;color:#777;margin-top:24px">Mensagem automática referente ao protocolo ${esc(item.protocol)}.</p></div></body></html>`;
}

function updateHtml(item) {
  const status = String(item.status || '').toLowerCase();
  const intro = status === 'aguardando_cliente'
    ? 'Precisamos de uma informação sua para continuar a análise.'
    : status === 'aprovada'
      ? 'Sua solicitação foi aprovada.'
      : status === 'concluida'
        ? 'Sua solicitação foi concluída.'
        : 'Temos uma atualização sobre sua solicitação.';
  const note = item.admin_note
    ? `<div style="background:#f5f3ef;padding:15px 18px;margin:20px 0"><p style="margin:0"><strong>Orientação da loja:</strong><br>${esc(item.admin_note)}</p></div>`
    : '';

  return `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;background:#f5f3ef;padding:28px;color:#171717"><div style="max-width:620px;margin:auto;background:#fff;padding:30px;border:1px solid #ddd"><h2 style="margin-top:0">Relógio e Cia</h2><p>Olá, ${esc(item.customer_name || 'cliente')}.</p><p><strong>${esc(intro)}</strong></p><p>Protocolo <strong>${esc(item.protocol)}</strong> · Pedido <strong>${esc(item.order_id)}</strong></p><div style="background:#f5f3ef;padding:15px 18px;margin:20px 0"><p style="margin:0"><strong>Status:</strong> ${esc(statusLabel(status))}</p></div>${note}<p>Se houver alguma ação necessária da sua parte, siga a orientação acima ou fale conosco pelos canais de atendimento informados no site.</p><p style="font-size:12px;color:#777;margin-top:24px">Mensagem automática referente ao protocolo ${esc(item.protocol)}.</p></div></body></html>`;
}

async function persistMarker(protocol, marker, providerId) {
  const requests = read(REQUESTS, []);
  const index = requests.findIndex(item => String(item?.protocol || '') === String(protocol));
  if (index < 0) return;
  requests[index].notifications = {
    ...(requests[index].notifications || {}),
    [`${marker}_sent_at`]: new Date().toISOString(),
    [`${marker}_provider_id`]: providerId || null
  };
  fs.writeFileSync(REQUESTS, JSON.stringify(requests, null, 2), 'utf8');
  await flushPersistentStore();
}

async function sendReceivedEmail(protocol) {
  const key = `received:${protocol}`;
  if (!protocol || inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const item = read(REQUESTS, []).find(request => String(request?.protocol || '') === String(protocol));
    if (!item?.email || item?.notifications?.received_email_sent_at) return;

    const result = await sendResendEmail({
      to: item.email,
      subject: `Recebemos sua solicitação ${item.protocol} — Relógio e Cia`,
      html: receivedHtml(item),
      idempotencyKey: `relogio-return-received-${item.protocol}`
    });
    if (!result.sent) {
      if (result.reason === 'not_configured') console.log('E-mail de pós-venda preparado, aguardando configuração do domínio/Resend.', { protocol });
      else console.warn('E-mail de pós-venda não enviado', { protocol, ...result });
      return;
    }
    await persistMarker(protocol, 'received_email', result.id);
    console.log('E-mail de abertura de pós-venda enviado', { protocol, to: item.email, resend_id: result.id || null });
  } catch (error) {
    console.warn('Falha não bloqueante no e-mail de pós-venda', { protocol, message: error.message });
  } finally {
    inFlight.delete(key);
  }
}

async function sendStatusEmail(protocol, status) {
  const normalized = String(status || '').toLowerCase();
  if (!IMPORTANT_STATUS.has(normalized)) return;
  const key = `${normalized}:${protocol}`;
  if (!protocol || inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const item = read(REQUESTS, []).find(request => String(request?.protocol || '') === String(protocol));
    if (!item?.email || String(item.status || '').toLowerCase() !== normalized) return;
    const marker = `status_${normalized}_email`;
    if (item?.notifications?.[`${marker}_sent_at`]) return;

    const result = await sendResendEmail({
      to: item.email,
      subject: `Atualização do protocolo ${item.protocol} — ${statusLabel(normalized)} — Relógio e Cia`,
      html: updateHtml(item),
      idempotencyKey: `relogio-return-${item.protocol}-${normalized}`
    });
    if (!result.sent) {
      if (result.reason === 'not_configured') console.log('Atualização de pós-venda preparada, aguardando configuração do domínio/Resend.', { protocol, status: normalized });
      else console.warn('Atualização de pós-venda não enviada', { protocol, status: normalized, ...result });
      return;
    }
    await persistMarker(protocol, marker, result.id);
    console.log('Atualização de pós-venda enviada', { protocol, status: normalized, to: item.email, resend_id: result.id || null });
  } catch (error) {
    console.warn('Falha não bloqueante na atualização de pós-venda', { protocol, status: normalized, message: error.message });
  } finally {
    inFlight.delete(key);
  }
}

function queueReturnRequestReceivedEmail(protocol) {
  setImmediate(() => { sendReceivedEmail(String(protocol || '')).catch(() => {}); });
}

function queueReturnRequestStatusEmail(protocol, status) {
  setImmediate(() => { sendStatusEmail(String(protocol || ''), String(status || '')).catch(() => {}); });
}

module.exports = {
  queueReturnRequestReceivedEmail,
  queueReturnRequestStatusEmail,
  sendReceivedEmail,
  sendStatusEmail
};
