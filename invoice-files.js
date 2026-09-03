const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { flushPersistentStore } = require('./persistent-store');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const ORDERS = path.join(DATA, 'orders.json');
const INVOICE_FILES = path.join(DATA, 'invoice-files.json');

const FILE_RULES = Object.freeze({
  danfe_pdf: { label: 'DANFE em PDF', extension: '.pdf', mime_type: 'application/pdf', max_bytes: 4 * 1024 * 1024 },
  nfe_xml: { label: 'XML da NF-e', extension: '.xml', mime_type: 'application/xml', max_bytes: 1024 * 1024 }
});
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

async function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  await flushPersistentStore();
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function validAdminToken(value) {
  try {
    const [body, sig] = String(value || '').split('.');
    if (!body || !sig) return false;
    const secret = String(process.env.ADMIN_SESSION_SECRET || '').trim();
    if (!secret) return false;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (!safeEqual(sig, expected)) return false;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.role === 'admin' && payload.exp > Date.now();
  } catch { return false; }
}

function admin(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!validAdminToken(token)) return res.status(401).json({ error: 'Sessão administrativa inválida ou expirada.' });
  next();
}

function normalizeStore(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanFilename(value, fallback) {
  const name = String(value || fallback || 'arquivo')
    .replace(/[\\/\u0000-\u001f\u007f]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return name || fallback;
}

function orderFiles(store, orderId) {
  const value = store[String(orderId || '')];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function metadata(item) {
  if (!item) return null;
  return {
    kind: item.kind,
    filename: item.filename,
    mime_type: item.mime_type,
    size_bytes: Number(item.size_bytes) || 0,
    sha256: item.sha256,
    uploaded_at: item.uploaded_at
  };
}

function listInvoiceFiles(orderId) {
  const store = normalizeStore(read(INVOICE_FILES, {}));
  const files = orderFiles(store, orderId);
  return Object.keys(FILE_RULES)
    .map(kind => metadata(files[kind]))
    .filter(Boolean);
}

function getInvoiceEmailAttachments(orderId) {
  const store = normalizeStore(read(INVOICE_FILES, {}));
  const files = orderFiles(store, orderId);
  return Object.keys(FILE_RULES)
    .map(kind => files[kind])
    .filter(item => item?.filename && item?.content_base64)
    .map(item => ({
      ...metadata(item),
      content: String(item.content_base64)
    }));
}

function decodeBase64(value) {
  const base64 = String(value || '').trim();
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    const error = new Error('O arquivo enviado está corrompido ou em formato inválido.');
    error.status = 400;
    throw error;
  }
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || buffer.toString('base64').replace(/=+$/, '') !== base64.replace(/=+$/, '')) {
    const error = new Error('O arquivo enviado está corrompido ou em formato inválido.');
    error.status = 400;
    throw error;
  }
  return buffer;
}

function validateFile(raw) {
  const kind = String(raw?.kind || '').trim().toLowerCase();
  const rule = FILE_RULES[kind];
  if (!rule) {
    const error = new Error('Tipo de arquivo fiscal inválido.');
    error.status = 400;
    throw error;
  }

  const filename = cleanFilename(raw?.filename, kind === 'danfe_pdf' ? 'danfe.pdf' : 'nfe.xml');
  if (!filename.toLowerCase().endsWith(rule.extension)) {
    const error = new Error(`${rule.label}: selecione um arquivo ${rule.extension.toUpperCase()}.`);
    error.status = 400;
    throw error;
  }

  const buffer = decodeBase64(raw?.content_base64);
  if (buffer.length > rule.max_bytes) {
    const maxMb = (rule.max_bytes / 1024 / 1024).toLocaleString('pt-BR');
    const error = new Error(`${rule.label}: o arquivo deve ter no máximo ${maxMb} MB.`);
    error.status = 413;
    throw error;
  }

  if (kind === 'danfe_pdf' && buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    const error = new Error('O DANFE selecionado não parece ser um PDF válido.');
    error.status = 400;
    throw error;
  }

  if (kind === 'nfe_xml') {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
    if (!text.startsWith('<') || !/<(?:[A-Za-z0-9_-]+:)?(?:nfeProc|NFe)\b/i.test(text.slice(0, 250000))) {
      const error = new Error('O XML selecionado não parece ser um XML de NF-e válido.');
      error.status = 400;
      throw error;
    }
  }

  const now = new Date().toISOString();
  return {
    kind,
    filename,
    mime_type: rule.mime_type,
    size_bytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    uploaded_at: now,
    content_base64: buffer.toString('base64')
  };
}

function isPaid(order) {
  const status = String(order?.status || '').toLowerCase();
  const payment = String(order?.payment_status || '').toLowerCase();
  return status === 'paid' || ['approved', 'processed'].includes(payment);
}

async function touchOrder(orderId) {
  const orders = read(ORDERS, []);
  const index = orders.findIndex(order => String(order?.id || '') === String(orderId));
  if (index < 0) return;
  const now = new Date().toISOString();
  orders[index].invoice_files_updated_at = now;
  orders[index].updated_at = now;
  await writeJson(ORDERS, orders);
}

function registerInvoiceFileRoutes(app) {
  app.use('/api/admin/invoice-files', express.json({ limit: '8mb' }));

  app.get('/api/admin/invoice-files/:orderId', admin, (req, res) => {
    const orderId = String(req.params.orderId || '').trim();
    const order = read(ORDERS, []).find(item => String(item?.id || '') === orderId);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
    res.set('Cache-Control', 'no-store');
    return res.json({
      order_id: orderId,
      invoice_status: String(order?.invoice?.status || 'pending'),
      files: listInvoiceFiles(orderId)
    });
  });

  app.put('/api/admin/invoice-files/:orderId', admin, async (req, res) => {
    try {
      const orderId = String(req.params.orderId || '').trim();
      const order = read(ORDERS, []).find(item => String(item?.id || '') === orderId);
      if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
      if (!isPaid(order)) return res.status(409).json({ error: 'Os arquivos da NF-e só podem ser anexados após a confirmação do pagamento.' });

      const rawFiles = Array.isArray(req.body?.files) ? req.body.files : [];
      if (!rawFiles.length || rawFiles.length > 2) {
        return res.status(400).json({ error: 'Selecione o DANFE em PDF, o XML da NF-e ou ambos.' });
      }

      const validated = rawFiles.map(validateFile);
      if (new Set(validated.map(file => file.kind)).size !== validated.length) {
        return res.status(400).json({ error: 'Envie no máximo um arquivo de cada tipo.' });
      }
      const totalBytes = validated.reduce((sum, file) => sum + file.size_bytes, 0);
      if (totalBytes > MAX_TOTAL_BYTES) {
        return res.status(413).json({ error: 'O conjunto do DANFE e XML deve ter no máximo 5 MB.' });
      }

      const store = normalizeStore(read(INVOICE_FILES, {}));
      const current = orderFiles(store, orderId);
      for (const file of validated) current[file.kind] = file;
      store[orderId] = current;
      await writeJson(INVOICE_FILES, store);
      await touchOrder(orderId);

      console.log('Arquivos fiscais atualizados', {
        orderId,
        files: validated.map(file => ({ kind: file.kind, size_bytes: file.size_bytes, sha256: file.sha256.slice(0, 12) }))
      });
      return res.json({ ok: true, order_id: orderId, files: listInvoiceFiles(orderId) });
    } catch (error) {
      console.error('Erro ao salvar arquivos da NF-e:', { message: error.message });
      return res.status(error.status || 500).json({ error: error.message || 'Não foi possível salvar os arquivos da NF-e.' });
    }
  });

  app.delete('/api/admin/invoice-files/:orderId/:kind', admin, async (req, res) => {
    try {
      const orderId = String(req.params.orderId || '').trim();
      const kind = String(req.params.kind || '').trim().toLowerCase();
      if (!FILE_RULES[kind]) return res.status(400).json({ error: 'Tipo de arquivo fiscal inválido.' });
      const order = read(ORDERS, []).find(item => String(item?.id || '') === orderId);
      if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

      const store = normalizeStore(read(INVOICE_FILES, {}));
      const current = orderFiles(store, orderId);
      if (!current[kind]) return res.json({ ok: true, order_id: orderId, files: listInvoiceFiles(orderId) });
      delete current[kind];
      if (Object.keys(current).length) store[orderId] = current;
      else delete store[orderId];
      await writeJson(INVOICE_FILES, store);
      // Remover um arquivo não dispara novo e-mail: mensagens já enviadas não podem ser recolhidas.
      // Ao enviar um arquivo substituto, o PUT toca o pedido e gera a versão atualizada.
      return res.json({ ok: true, order_id: orderId, files: listInvoiceFiles(orderId) });
    } catch (error) {
      console.error('Erro ao remover arquivo da NF-e:', { message: error.message });
      return res.status(500).json({ error: 'Não foi possível remover o arquivo fiscal.' });
    }
  });
}

module.exports = {
  FILE_RULES,
  listInvoiceFiles,
  getInvoiceEmailAttachments,
  registerInvoiceFileRoutes
};
