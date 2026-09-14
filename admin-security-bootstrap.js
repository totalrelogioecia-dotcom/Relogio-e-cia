const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { recordAudit, recordRequestAudit, tokenPayload } = require('./admin-audit');
const { flushPersistentStore } = require('./persistent-store');

const COOKIE_NAME = 'reloja_admin_session';
const SESSION_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const ADMIN_USERS_FILE = path.join(DATA, 'admin-users.json');
const ACCESS_LEVELS = new Set(['owner', 'manager', 'atendimento']);
const loginAttempts = new Map();

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 100);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function normalizeAccessLevel(value) {
  const level = String(value || '').trim().toLowerCase();
  return ACCESS_LEVELS.has(level) ? level : 'atendimento';
}

function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function passwordMatches(password, encoded) {
  try {
    const [scheme, salt, expectedHex] = String(encoded || '').split('$');
    if (scheme !== 'scrypt' || !salt || !expectedHex) return false;
    const actual = crypto.scryptSync(String(password || ''), salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function readAdminUsers() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ADMIN_USERS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAdminUsers(users) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(ADMIN_USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function cloneAdminUsers(users) {
  return users.map(user => ({ ...user }));
}

async function persistAdminUsers(users, previousUsers) {
  writeAdminUsers(users);
  try {
    await flushPersistentStore();
  } catch (error) {
    if (previousUsers) {
      writeAdminUsers(previousUsers);
      await flushPersistentStore().catch(() => {});
    }
    throw error;
  }
}

function publicAdminUser(user) {
  return {
    id: String(user?.id || ''),
    name: normalizeName(user?.name) || 'Administrador',
    email: normalizeEmail(user?.email),
    access_level: normalizeAccessLevel(user?.access_level),
    active: user?.active !== false,
    created_at: user?.created_at || null,
    updated_at: user?.updated_at || null,
    last_login_at: user?.last_login_at || null
  };
}

function seedEnvOwnerIfNeeded() {
  const users = readAdminUsers();
  if (users.length) return users;

  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email || !password) return users;

  const now = new Date().toISOString();
  const owner = {
    id: crypto.randomUUID(),
    name: 'Proprietário',
    email,
    password_hash: passwordHash(password),
    access_level: 'owner',
    active: true,
    session_version: 1,
    created_at: now,
    updated_at: now,
    last_login_at: null
  };
  writeAdminUsers([owner]);
  console.log('Usuário proprietário do Admin criado a partir das variáveis de ambiente.');
  return [owner];
}

function makeToken(payload) {
  const secret = String(process.env.ADMIN_SESSION_SECRET || '').trim();
  if (!secret) throw new Error('ADMIN_SESSION_SECRET não configurado.');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function authenticatedToken(value) {
  try {
    const [body, sig] = String(value || '').split('.');
    if (!body || !sig) return null;
    const secret = String(process.env.ADMIN_SESSION_SECRET || '').trim();
    if (!secret) return null;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (!safeEqual(sig, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.role !== 'admin' || Number(payload.exp) <= Date.now()) return null;

    if (!payload.user_id) return null;
    const users = readAdminUsers();
    const user = users.find(item => String(item.id) === String(payload.user_id));
    if (!user || user.active === false) return null;
    if (Number(user.session_version || 1) !== Number(payload.session_version || 1)) return null;
    return {
      ...payload,
      email: normalizeEmail(user.email),
      name: normalizeName(user.name) || 'Administrador',
      access_level: normalizeAccessLevel(user.access_level)
    };
  } catch {
    return null;
  }
}

function validToken(value) {
  return Boolean(authenticatedToken(value));
}

function parseCookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try { result[key] = decodeURIComponent(value); }
    catch { result[key] = value; }
  }
  return result;
}

function secureRequest(req) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return Boolean(req.secure || forwarded === 'https' || process.env.NODE_ENV === 'production');
}

function sessionCookie(req, token, maxAgeSeconds) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/api/admin',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
  ];
  if (secureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

function currentAttempt(ip) {
  const now = Date.now();
  const state = loginAttempts.get(ip);
  if (!state) return { failures: 0, firstFailureAt: now, blockedUntil: 0 };
  if (state.blockedUntil > now) return state;
  if (now - state.firstFailureAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return { failures: 0, firstFailureAt: now, blockedUntil: 0 };
  }
  return state;
}

function recordFailure(ip) {
  const now = Date.now();
  const state = currentAttempt(ip);
  state.failures += 1;
  if (state.failures >= LOGIN_MAX_FAILURES) state.blockedUntil = now + LOGIN_BLOCK_MS;
  loginAttempts.set(ip, state);
  return state;
}

function securityHeaders(res) {
  res.set('Cache-Control', 'no-store');
  res.set('X-Frame-Options', 'DENY');
  res.set('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  res.set('Referrer-Policy', 'same-origin');
}

function safeAudit(entry) {
  try { recordAudit(entry); }
  catch (error) { console.error('Falha ao registrar auditoria administrativa:', error.message); }
}

function adminPath(req) {
  return String(req.originalUrl || req.url || '').split('?')[0];
}

function canAccessAdminRequest(payload, req) {
  const level = normalizeAccessLevel(payload?.access_level || 'owner');
  if (level === 'owner') return true;

  const method = String(req.method || 'GET').toUpperCase();
  const requestPath = adminPath(req);
  if (requestPath.startsWith('/api/admin/users')) return false;

  if (level === 'manager') {
    if (method === 'DELETE' && /\/api\/admin\/products\/[^/]+\/permanent$/.test(requestPath)) return false;
    if (requestPath.startsWith('/api/admin/melhorenvio') && method !== 'GET') return false;
    return true;
  }

  if (method === 'GET') {
    const deniedPrefixes = [
      '/api/admin/audit',
      '/api/admin/coupons',
      '/api/admin/melhorenvio',
      '/api/admin/product-details',
      '/api/admin/products',
      '/api/admin/shipping-products'
    ];
    return !deniedPrefixes.some(prefix => requestPath === prefix || requestPath.startsWith(`${prefix}/`));
  }

  if (method === 'PATCH') {
    return /^\/api\/admin\/(?:availability-requests|return-requests|reviews)\//.test(requestPath)
      || /^\/api\/admin\/orders\/[^/]+\/fulfillment$/.test(requestPath);
  }

  return false;
}

function activeOwnerCount(users) {
  return users.filter(user => user.active !== false && normalizeAccessLevel(user.access_level) === 'owner').length;
}

function validatePassword(password, required) {
  const value = String(password || '');
  if (!value && !required) return '';
  if (value.length < 10) throw Object.assign(new Error('A senha deve ter pelo menos 10 caracteres.'), { statusCode: 400 });
  if (value.length > 200) throw Object.assign(new Error('A senha informada é muito longa.'), { statusCode: 400 });
  return value;
}

seedEnvOwnerIfNeeded();

const originalExpress = express;
if (!originalExpress.__relogioAdminSecurityPatched) {
  const wrappedExpress = function (...args) {
    const app = originalExpress(...args);

    app.get('/admin.html', (req, res, next) => {
      try {
        securityHeaders(res);
        const file = path.join(__dirname, 'admin.html');
        let html = fs.readFileSync(file, 'utf8');
        if (!html.includes('admin-secure-client.js')) {
          html = html.replace('</body>', '<script src="admin-secure-client.js"></script></body>');
        }
        if (!html.includes('admin-extra-tabs.js')) {
          html = html.replace('</body>', '<script src="admin-extra-tabs.js?v=1"></script></body>');
        }
        if (!html.includes('admin-extra-tabs-navigation-fix.js')) {
          html = html.replace('</body>', '<script src="admin-extra-tabs-navigation-fix.js?v=1"></script></body>');
        }
        if (!html.includes('admin-favorites.js')) {
          html = html.replace('</body>', '<script src="admin-favorites.js?v=1"></script></body>');
        }
        if (!html.includes('accessibility-panel.js')) {
          html = html.replace('</body>', '<script src="accessibility-panel.js?v=1"></script></body>');
        }
        if (!html.includes('admin-users-management.js')) {
          html = html.replace('</body>', '<script src="admin-users-management.js?v=1"></script></body>');
        }
        html = html.replace('admin-order-cancellation.js?v=1', 'admin-order-cancellation.js?v=2');
        res.type('html').send(html);
      } catch (error) {
        next(error);
      }
    });

    app.post('/api/admin/login', originalExpress.json({ limit: '20kb' }), async (req, res) => {
      securityHeaders(res);
      const ip = clientIp(req);
      const state = currentAttempt(ip);
      const now = Date.now();

      if (state.blockedUntil > now) {
        const retryAfter = Math.max(1, Math.ceil((state.blockedUntil - now) / 1000));
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({ error: 'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.' });
      }

      try {
        const email = normalizeEmail(req.body?.email);
        const senha = String(req.body?.senha || '');
        const secret = String(process.env.ADMIN_SESSION_SECRET || '').trim();
        const users = seedEnvOwnerIfNeeded();
        const user = users.find(item => normalizeEmail(item.email) === email && item.active !== false);

        if (!secret || !users.length) {
          return res.status(503).json({ error: 'Painel administrativo não configurado.' });
        }

        if (!user || !passwordMatches(senha, user.password_hash)) {
          const failed = recordFailure(ip);
          console.warn('Tentativa de login administrativo recusada', {
            ip,
            failures: failed.failures,
            blocked: failed.blockedUntil > Date.now()
          });
          if (failed.blockedUntil > Date.now()) {
            res.set('Retry-After', String(Math.ceil(LOGIN_BLOCK_MS / 1000)));
            return res.status(429).json({ error: 'Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente.' });
          }
          return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
        }

        loginAttempts.delete(ip);
        const previousUsers = cloneAdminUsers(users);
        const loggedAt = new Date().toISOString();
        user.last_login_at = loggedAt;
        user.updated_at = user.updated_at || loggedAt;
        await persistAdminUsers(users, previousUsers);

        const token = makeToken({
          role: 'admin',
          user_id: user.id,
          email: normalizeEmail(user.email),
          name: normalizeName(user.name) || 'Administrador',
          access_level: normalizeAccessLevel(user.access_level),
          session_version: Number(user.session_version || 1),
          exp: Date.now() + SESSION_MS
        });
        res.setHeader('Set-Cookie', sessionCookie(req, token, SESSION_MS / 1000));
        console.log('Login administrativo autorizado', { ip, user: user.email });
        safeAudit({
          actor: user.email,
          action: 'Login administrativo',
          entity: 'sessão',
          method: 'POST',
          path: '/api/admin/login',
          status_code: 200,
          success: true,
          ip,
          user_agent: req.headers['user-agent']
        });

        return res.json({ token: 'cookie-session', admin: publicAdminUser(user) });
      } catch (error) {
        console.error('Erro no login administrativo:', error.message);
        return res.status(500).json({ error: 'Não foi possível entrar no painel.' });
      }
    });

    app.post('/api/admin/logout', originalExpress.json({ limit: '2kb' }), (req, res) => {
      securityHeaders(res);
      const sessionToken = parseCookies(req)[COOKIE_NAME];
      const payload = tokenPayload(sessionToken);
      safeAudit({
        actor: payload?.email || process.env.ADMIN_EMAIL || 'administrador',
        action: 'Logout administrativo',
        entity: 'sessão',
        method: 'POST',
        path: '/api/admin/logout',
        status_code: 200,
        success: true,
        ip: clientIp(req),
        user_agent: req.headers['user-agent']
      });
      res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
      return res.json({ ok: true });
    });

    app.get('/api/admin/session', (req, res) => {
      securityHeaders(res);
      const token = parseCookies(req)[COOKIE_NAME];
      const payload = authenticatedToken(token);
      if (!payload) return res.json({ authenticated: false });
      const users = readAdminUsers();
      const user = users.find(item => String(item.id) === String(payload.user_id));
      return res.json({
        authenticated: true,
        admin: user ? publicAdminUser(user) : {
          id: payload.user_id || '',
          name: payload.name || 'Proprietário',
          email: payload.email,
          access_level: payload.access_level || 'owner',
          active: true
        }
      });
    });

    app.use('/api/admin', (req, res, next) => {
      securityHeaders(res);
      const token = parseCookies(req)[COOKIE_NAME];
      const payload = authenticatedToken(token);
      if (!payload) {
        return res.status(401).json({ error: 'Sessão administrativa inválida ou expirada.' });
      }
      if (!canAccessAdminRequest(payload, req)) {
        return res.status(403).json({ error: 'Seu usuário não tem permissão para realizar esta ação.' });
      }

      req.admin = payload;
      req.headers.authorization = `Bearer ${token}`;
      if (!adminPath(req).startsWith('/api/admin/users')) recordRequestAudit(req, res, token);
      return next();
    });

    app.get('/api/admin/users', (req, res) => {
      const users = readAdminUsers().map(publicAdminUser).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      return res.json(users);
    });

    app.post('/api/admin/users', originalExpress.json({ limit: '30kb' }), async (req, res) => {
      try {
        const users = readAdminUsers();
        const name = normalizeName(req.body?.name);
        const email = normalizeEmail(req.body?.email);
        const password = validatePassword(req.body?.password, true);
        const accessLevel = normalizeAccessLevel(req.body?.access_level);
        if (!name) return res.status(400).json({ error: 'Informe o nome do usuário.' });
        if (!validEmail(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
        if (users.some(item => normalizeEmail(item.email) === email)) {
          return res.status(409).json({ error: 'Já existe um usuário administrativo com este e-mail.' });
        }

        const now = new Date().toISOString();
        const user = {
          id: crypto.randomUUID(),
          name,
          email,
          password_hash: passwordHash(password),
          access_level: accessLevel,
          active: true,
          session_version: 1,
          created_at: now,
          updated_at: now,
          last_login_at: null
        };
        const previousUsers = cloneAdminUsers(users);
        users.push(user);
        await persistAdminUsers(users, previousUsers);
        safeAudit({
          actor: req.admin?.email,
          action: 'Usuário administrativo criado',
          entity: 'usuário administrativo',
          entity_id: email,
          method: 'POST',
          path: '/api/admin/users',
          status_code: 201,
          success: true,
          ip: clientIp(req),
          user_agent: req.headers['user-agent']
        });
        return res.status(201).json(publicAdminUser(user));
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Não foi possível criar o usuário administrativo.' });
      }
    });

    app.patch('/api/admin/users/:id', originalExpress.json({ limit: '30kb' }), async (req, res) => {
      try {
        const users = readAdminUsers();
        const index = users.findIndex(item => String(item.id) === String(req.params.id));
        if (index < 0) return res.status(404).json({ error: 'Usuário administrativo não encontrado.' });

        const current = users[index];
        const isSelf = String(current.id) === String(req.admin?.user_id);
        const nextName = req.body?.name === undefined ? normalizeName(current.name) : normalizeName(req.body.name);
        const nextEmail = req.body?.email === undefined ? normalizeEmail(current.email) : normalizeEmail(req.body.email);
        const nextAccess = req.body?.access_level === undefined ? normalizeAccessLevel(current.access_level) : normalizeAccessLevel(req.body.access_level);
        const nextActive = req.body?.active === undefined ? current.active !== false : Boolean(req.body.active);
        const newPassword = validatePassword(req.body?.password, false);

        if (!nextName) return res.status(400).json({ error: 'Informe o nome do usuário.' });
        if (!validEmail(nextEmail)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
        if (users.some((item, itemIndex) => itemIndex !== index && normalizeEmail(item.email) === nextEmail)) {
          return res.status(409).json({ error: 'Já existe outro usuário administrativo com este e-mail.' });
        }
        if (isSelf && nextActive === false) return res.status(400).json({ error: 'Você não pode bloquear o usuário que está usando agora.' });
        if (isSelf && nextAccess !== normalizeAccessLevel(current.access_level)) {
          return res.status(400).json({ error: 'Para alterar seu próprio nível de acesso, use outro usuário proprietário.' });
        }
        if (isSelf && nextEmail !== normalizeEmail(current.email)) {
          return res.status(400).json({ error: 'Para alterar seu próprio e-mail, use outro usuário proprietário.' });
        }

        const now = new Date().toISOString();
        const sensitiveChanged = nextEmail !== normalizeEmail(current.email)
          || nextAccess !== normalizeAccessLevel(current.access_level)
          || nextActive !== (current.active !== false)
          || Boolean(newPassword);
        const updated = {
          ...current,
          name: nextName,
          email: nextEmail,
          access_level: nextAccess,
          active: nextActive,
          updated_at: now,
          session_version: Number(current.session_version || 1) + (sensitiveChanged ? 1 : 0)
        };
        if (newPassword) updated.password_hash = passwordHash(newPassword);

        const proposed = users.slice();
        proposed[index] = updated;
        if (activeOwnerCount(proposed) < 1) {
          return res.status(400).json({ error: 'O painel precisa manter pelo menos um proprietário ativo.' });
        }

        await persistAdminUsers(proposed, users);
        safeAudit({
          actor: req.admin?.email,
          action: newPassword ? 'Usuário administrativo e senha atualizados' : 'Usuário administrativo atualizado',
          entity: 'usuário administrativo',
          entity_id: nextEmail,
          method: 'PATCH',
          path: `/api/admin/users/${encodeURIComponent(current.id)}`,
          status_code: 200,
          success: true,
          ip: clientIp(req),
          user_agent: req.headers['user-agent']
        });
        return res.json({ user: publicAdminUser(updated), session_invalidated: isSelf && sensitiveChanged });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Não foi possível atualizar o usuário administrativo.' });
      }
    });

    return app;
  };

  Object.assign(wrappedExpress, originalExpress);
  wrappedExpress.__relogioAdminSecurityPatched = true;
  require.cache[require.resolve('express')].exports = wrappedExpress;
}
