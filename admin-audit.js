const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const AUDIT_FILE = path.join(DATA, 'admin-audit.json');
const MAX_ENTRIES = 2500;

function readAudit() {
  try {
    const data = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeAudit(entries) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(entries.slice(-MAX_ENTRIES), null, 2), 'utf8');
}

function text(value, max = 240) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function clientIp(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return text(forwarded || req?.socket?.remoteAddress || 'unknown', 80);
}

function tokenPayload(token) {
  try {
    const [body] = String(token || '').split('.');
    if (!body) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

function targetFromPath(requestPath) {
  const clean = String(requestPath || '').split('?')[0];
  const patterns = [
    [/^\/api\/admin\/products\/([^/]+)/, 'produto'],
    [/^\/api\/admin\/orders\/([^/]+)\/invoice/, 'nf-e'],
    [/^\/api\/admin\/orders\/([^/]+)\/fulfillment/, 'envio'],
    [/^\/api\/admin\/orders\/([^/]+)\/(?:cancel|cancellation)/, 'cancelamento'],
    [/^\/api\/admin\/return-requests\/([^/]+)/, 'pós-venda'],
    [/^\/api\/admin\/availability-requests\/([^/]+)/, 'confirmação'],
    [/^\/api\/admin\/coupons\/([^/]+)/, 'cupom'],
    [/^\/api\/admin\/reviews\/([^/]+)/, 'avaliação']
  ];
  for (const [regex, entity] of patterns) {
    const match = clean.match(regex);
    if (match) return { entity, entity_id: decodeURIComponent(match[1]).slice(0, 160) };
  }
  if (clean === '/api/admin/products') return { entity: 'produto', entity_id: null };
  if (clean === '/api/admin/coupons') return { entity: 'cupom', entity_id: null };
  if (clean === '/api/admin/reviews') return { entity: 'avaliação', entity_id: null };
  return { entity: 'administração', entity_id: null };
}

function actionFromRequest(method, requestPath) {
  const m = String(method || '').toUpperCase();
  const p = String(requestPath || '').split('?')[0];
  if (m === 'POST' && p === '/api/admin/products') return 'Produto criado';
  if (m === 'PUT' && /^\/api\/admin\/products\//.test(p)) return 'Produto atualizado';
  if (m === 'DELETE' && /\/products\/[^/]+\/permanent$/.test(p)) return 'Produto excluído permanentemente';
  if (m === 'DELETE' && /^\/api\/admin\/products\//.test(p)) return 'Produto ocultado';
  if (m === 'PATCH' && /\/orders\/[^/]+\/invoice$/.test(p)) return 'NF-e atualizada';
  if (m === 'PATCH' && /\/orders\/[^/]+\/fulfillment$/.test(p)) return 'Envio atualizado';
  if (['POST', 'PATCH'].includes(m) && /\/orders\/[^/]+\/(?:cancel|cancellation)/.test(p)) return 'Cancelamento/reembolso processado';
  if (m === 'PATCH' && /\/return-requests\//.test(p)) return 'Pós-venda atualizado';
  if (m === 'PATCH' && /\/availability-requests\//.test(p)) return 'Confirmação de disponibilidade atualizada';
  if (m === 'POST' && p === '/api/admin/coupons') return 'Cupom criado';
  if (m === 'PUT' && /\/coupons\//.test(p)) return 'Cupom atualizado';
  if (m === 'DELETE' && /\/coupons\//.test(p)) return 'Cupom excluído';
  if (m === 'PATCH' && /\/reviews\//.test(p)) return 'Avaliação moderada';
  return `Alteração administrativa (${m})`;
}

function recordAudit(entry = {}) {
  const now = new Date().toISOString();
  const list = readAudit();
  const safe = {
    id: crypto.randomUUID(),
    created_at: now,
    actor: text(entry.actor || 'administrador', 180),
    action: text(entry.action || 'Ação administrativa', 180),
    entity: text(entry.entity || 'administração', 80),
    entity_id: entry.entity_id == null ? null : text(entry.entity_id, 160),
    method: text(entry.method, 12).toUpperCase() || null,
    path: text(entry.path, 260) || null,
    status_code: Number(entry.status_code) || null,
    success: entry.success !== false,
    ip: text(entry.ip, 80) || null,
    user_agent: text(entry.user_agent, 220) || null
  };
  list.push(safe);
  writeAudit(list);
  return safe;
}

function recordRequestAudit(req, res, token) {
  const method = String(req?.method || '').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
  const requestPath = String(req?.originalUrl || req?.url || '');
  const payload = tokenPayload(token);
  const target = targetFromPath(requestPath);
  res.once('finish', () => {
    try {
      recordAudit({
        actor: payload?.email || process.env.ADMIN_EMAIL || 'administrador',
        action: actionFromRequest(method, requestPath),
        ...target,
        method,
        path: requestPath,
        status_code: res.statusCode,
        success: res.statusCode >= 200 && res.statusCode < 400,
        ip: clientIp(req),
        user_agent: req?.headers?.['user-agent']
      });
    } catch (error) {
      console.error('Falha ao registrar auditoria administrativa:', error.message);
    }
  });
}

function listAudit(limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  return readAudit()
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, safeLimit);
}

module.exports = {
  actionFromRequest,
  listAudit,
  recordAudit,
  recordRequestAudit,
  targetFromPath,
  tokenPayload
};