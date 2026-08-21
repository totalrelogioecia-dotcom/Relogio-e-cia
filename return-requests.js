const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { flushPersistentStore } = require('./persistent-store');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const ORDERS = path.join(DATA, 'orders.json');
const REQUESTS = path.join(DATA, 'return-requests.json');

const PUBLIC_STATUSES = new Set(['recebida', 'em_analise', 'aguardando_cliente', 'aprovada', 'concluida', 'recusada']);
const TYPES = new Set(['troca', 'devolucao', 'estorno', 'garantia', 'outro']);
const OPEN_STATUSES = new Set(['recebida', 'em_analise', 'aguardando_cliente', 'aprovada']);
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 1_500_000;
const MAX_TOTAL_ATTACHMENT_BYTES = 4_000_000;

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

async function writeRequests(value) {
  fs.writeFileSync(REQUESTS, JSON.stringify(value, null, 2), 'utf8');
  await flushPersistentStore();
}

function email(value) {
  return String(value || '').trim().toLowerCase().slice(0, 180);
}

function text(value, max) {
  return String(value || '').trim().replace(/\r/g, '').slice(0, max);
}

function protocol() {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `ATD-${stamp}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function attachmentBytes(dataUrl) {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return Infinity;
  return Math.floor((dataUrl.length - comma - 1) * 0.75);
}

function normalizeAttachments(value) {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_ATTACHMENTS) throw Object.assign(new Error(`Envie no máximo ${MAX_ATTACHMENTS} imagens.`), { status: 400 });

  let total = 0;
  return value.map((item, index) => {
    const data = String(item?.data || item || '');
    const name = text(item?.name || `imagem-${index + 1}`, 120);
    if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(data)) {
      throw Object.assign(new Error('Os anexos devem ser imagens JPG, PNG ou WebP.'), { status: 400 });
    }
    const bytes = attachmentBytes(data);
    if (!Number.isFinite(bytes) || bytes > MAX_ATTACHMENT_BYTES) {
      throw Object.assign(new Error('Cada imagem deve ter no máximo 1,5 MB após o processamento.'), { status: 400 });
    }
    total += bytes;
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
      throw Object.assign(new Error('O conjunto de imagens deve ter no máximo 4 MB.'), { status: 400 });
    }
    return { name, data, bytes };
  });
}

function publicRequest(item) {
  return {
    protocol: item.protocol,
    order_id: item.order_id,
    type: item.type,
    reason: item.reason,
    status: item.status,
    created_at: item.created_at,
    updated_at: item.updated_at,
    admin_note: item.admin_note || null
  };
}

function adminSummary(item) {
  return {
    protocol: item.protocol,
    order_id: item.order_id,
    customer_name: item.customer_name,
    email: item.email,
    type: item.type,
    reason: item.reason,
    status: item.status,
    attachments_count: Array.isArray(item.attachments) ? item.attachments.length : 0,
    created_at: item.created_at,
    updated_at: item.updated_at,
    admin_note: item.admin_note || null
  };
}

function registerReturnRequestRoutes(app) {
  app.use('/api/return-requests', express.json({ limit: '6mb' }));
  app.use('/api/admin/return-requests', express.json({ limit: '6mb' }));

  app.post('/api/return-requests', async (req, res) => {
    try {
      const orderId = text(req.body?.order_id, 80);
      const customerEmail = email(req.body?.email);
      const type = text(req.body?.type, 30).toLowerCase();
      const reason = text(req.body?.reason, 220);
      const message = text(req.body?.message, 3000);

      if (!orderId || !customerEmail || !TYPES.has(type) || !reason || message.length < 10) {
        return res.status(400).json({ error: 'Preencha pedido, e-mail, tipo, motivo e uma mensagem com pelo menos 10 caracteres.' });
      }

      const order = read(ORDERS, []).find(item => String(item.id) === orderId);
      const orderEmail = email(order?.payer?.email);
      if (!order || !orderEmail || orderEmail !== customerEmail) {
        return res.status(404).json({ error: 'Não encontramos esse pedido para o e-mail informado.' });
      }

      const requests = read(REQUESTS, []);
      const existing = requests.find(item => item.order_id === orderId && item.email === customerEmail && OPEN_STATUSES.has(item.status));
      if (existing) {
        return res.status(409).json({
          error: `Já existe uma solicitação em andamento para este pedido: ${existing.protocol}.`,
          protocol: existing.protocol,
          status: existing.status
        });
      }

      const attachments = normalizeAttachments(req.body?.attachments);
      const now = new Date().toISOString();
      const item = {
        id: crypto.randomUUID(),
        protocol: protocol(),
        order_id: orderId,
        customer_name: text(order?.payer?.nome || '', 120),
        email: customerEmail,
        type,
        reason,
        message,
        attachments,
        status: 'recebida',
        admin_note: '',
        history: [{ status: 'recebida', at: now, source: 'customer' }],
        created_at: now,
        updated_at: now
      };

      requests.push(item);
      await writeRequests(requests);
      console.log('Solicitação pós-venda criada', { protocol: item.protocol, order_id: item.order_id, type: item.type });
      res.set('Cache-Control', 'no-store');
      return res.status(201).json({ request: publicRequest(item) });
    } catch (error) {
      console.error('Erro ao criar solicitação pós-venda:', error.message);
      return res.status(error.status || 500).json({ error: error.message || 'Não foi possível registrar a solicitação.' });
    }
  });

  app.get('/api/return-requests/status', (req, res) => {
    const code = text(req.query?.protocol, 80).toUpperCase();
    const customerEmail = email(req.query?.email);
    if (!code || !customerEmail) return res.status(400).json({ error: 'Informe o protocolo e o e-mail.' });

    const item = read(REQUESTS, []).find(request => request.protocol === code && request.email === customerEmail);
    if (!item) return res.status(404).json({ error: 'Solicitação não encontrada para os dados informados.' });
    res.set('Cache-Control', 'no-store');
    return res.json({ request: publicRequest(item) });
  });

  app.get('/api/admin/return-requests', (req, res) => {
    const list = read(REQUESTS, [])
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(adminSummary);
    res.set('Cache-Control', 'no-store');
    return res.json(list);
  });

  app.get('/api/admin/return-requests/:protocol', (req, res) => {
    const code = text(req.params.protocol, 80).toUpperCase();
    const item = read(REQUESTS, []).find(request => request.protocol === code);
    if (!item) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    const order = read(ORDERS, []).find(orderItem => String(orderItem.id) === item.order_id) || null;
    res.set('Cache-Control', 'no-store');
    return res.json({
      request: { ...item, attachments: item.attachments || [] },
      order: order ? {
        id: order.id,
        status: order.status,
        payment_status: order.payment_status,
        total: order.total,
        metodo: order.metodo,
        items: Array.isArray(order.items) ? order.items.map(product => ({ nome: product.nome, quantidade: product.quantidade })) : []
      } : null
    });
  });

  app.patch('/api/admin/return-requests/:protocol', async (req, res) => {
    try {
      const code = text(req.params.protocol, 80).toUpperCase();
      const status = text(req.body?.status, 40).toLowerCase();
      const adminNote = text(req.body?.admin_note, 2000);
      if (!PUBLIC_STATUSES.has(status)) return res.status(400).json({ error: 'Status inválido.' });

      const requests = read(REQUESTS, []);
      const index = requests.findIndex(item => item.protocol === code);
      if (index < 0) return res.status(404).json({ error: 'Solicitação não encontrada.' });

      const now = new Date().toISOString();
      const previousStatus = requests[index].status;
      requests[index].status = status;
      requests[index].admin_note = adminNote;
      requests[index].updated_at = now;
      if (previousStatus !== status) {
        requests[index].history = Array.isArray(requests[index].history) ? requests[index].history : [];
        requests[index].history.push({ status, at: now, source: 'admin' });
      }
      await writeRequests(requests);
      return res.json({ request: adminSummary(requests[index]) });
    } catch (error) {
      console.error('Erro ao atualizar solicitação pós-venda:', error.message);
      return res.status(500).json({ error: 'Não foi possível atualizar a solicitação.' });
    }
  });
}

module.exports = { registerReturnRequestRoutes };
