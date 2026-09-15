const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { flushPersistentStore } = require('./persistent-store');
const { recordAudit } = require('./admin-audit');

const COOKIE_NAME = 'reloja_admin_session';
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA, 'admin-users.json');

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseCookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeAccessLevel(value) {
  const level = String(value || '').trim().toLowerCase();
  return ['owner', 'manager', 'atendimento'].includes(level) ? level : 'atendimento';
}

function readUsers() {
  try {
    const parsed = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function authenticatedPayload(req) {
  try {
    const token = parseCookies(req)[COOKIE_NAME];
    const [body, sig] = String(token || '').split('.');
    const secret = String(process.env.ADMIN_SESSION_SECRET || '').trim();
    if (!body || !sig || !secret) return null;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (!safeEqual(sig, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.role !== 'admin' || Number(payload.exp) <= Date.now() || !payload.user_id) return null;
    const users = readUsers();
    const current = users.find(user => String(user.id) === String(payload.user_id));
    if (!current || current.active === false) return null;
    if (Number(current.session_version || 1) !== Number(payload.session_version || 1)) return null;
    return { ...payload, email: normalizeEmail(current.email), access_level: normalizeAccessLevel(current.access_level) };
  } catch {
    return null;
  }
}

function ownerCount(users) {
  return users.filter(user => user.active !== false && normalizeAccessLevel(user.access_level) === 'owner').length;
}

function wrapExpress(originalExpress) {
  const wrappedExpress = function (...args) {
    const app = originalExpress(...args);
    app.delete('/api/admin/users/:id', originalExpress.json({ limit: '10kb' }), async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const actor = authenticatedPayload(req);
      if (!actor) return res.status(401).json({ error: 'Sessão administrativa inválida ou expirada.' });
      if (actor.access_level !== 'owner') return res.status(403).json({ error: 'Somente o proprietário pode excluir usuários administrativos.' });

      const users = readUsers();
      const index = users.findIndex(user => String(user.id) === String(req.params.id));
      if (index < 0) return res.status(404).json({ error: 'Usuário administrativo não encontrado.' });

      const target = users[index];
      if (String(target.id) === String(actor.user_id)) {
        return res.status(400).json({ error: 'Você não pode excluir o usuário que está usando agora.' });
      }

      const proposed = users.slice();
      proposed.splice(index, 1);
      if (ownerCount(proposed) < 1) {
        return res.status(400).json({ error: 'O painel precisa manter pelo menos um proprietário ativo.' });
      }

      try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(proposed, null, 2), 'utf8');
        await flushPersistentStore();
        try {
          recordAudit({
            actor: actor.email,
            action: 'Usuário administrativo excluído',
            entity: 'usuário administrativo',
            entity_id: normalizeEmail(target.email),
            method: 'DELETE',
            path: `/api/admin/users/${encodeURIComponent(target.id)}`,
            status_code: 200,
            success: true,
            ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
            user_agent: req.headers['user-agent']
          });
        } catch {}
        return res.json({ ok: true, deleted_id: String(target.id) });
      } catch (error) {
        try {
          fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
          await flushPersistentStore().catch(() => {});
        } catch {}
        console.error('Erro ao excluir usuário administrativo:', error.message);
        return res.status(500).json({ error: 'Não foi possível excluir o usuário administrativo.' });
      }
    });
    return app;
  };

  Object.assign(wrappedExpress, originalExpress);
  return wrappedExpress;
}

const currentExpress = express;
if (!currentExpress.__relogioAdminDeletePatched) {
  const wrapped = wrapExpress(currentExpress);
  wrapped.__relogioAdminDeletePatched = true;
  require.cache[require.resolve('express')].exports = wrapped;
}
