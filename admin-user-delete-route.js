const fs = require('fs');
const path = require('path');
const express = require('express');
const { flushPersistentStore } = require('./persistent-store');
const { recordAudit } = require('./admin-audit');
const adminSession = require('./admin-session');

const COOKIE_NAME = 'reloja_admin_session';
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA, 'admin-users.json');

function normalizeEmail(value) {
  return adminSession.normalizeEmail(value);
}

function normalizeAccessLevel(value) {
  return adminSession.normalizeAccessLevel(value);
}

function readUsers() {
  return adminSession.readAdminUsers();
}

function authenticatedPayload(req) {
  return adminSession.authenticatedRequest(req);
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
            ip: req.ip || req.socket?.remoteAddress || 'unknown',
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
