const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const COOKIE_NAME = 'reloja_admin_session';
const SESSION_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const loginAttempts = new Map();

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function makeToken(payload) {
  const secret = String(process.env.ADMIN_SESSION_SECRET || '').trim();
  if (!secret) throw new Error('ADMIN_SESSION_SECRET não configurado.');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function validToken(value) {
  try {
    const [body, sig] = String(value || '').split('.');
    if (!body || !sig) return false;
    const secret = String(process.env.ADMIN_SESSION_SECRET || '').trim();
    if (!secret) return false;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (!safeEqual(sig, expected)) return false;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.role === 'admin' && Number(payload.exp) > Date.now();
  } catch {
    return false;
  }
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
        html = html.replace('admin-order-cancellation.js?v=1', 'admin-order-cancellation.js?v=2');
        res.type('html').send(html);
      } catch (error) {
        next(error);
      }
    });

    app.post('/api/admin/login', originalExpress.json({ limit: '20kb' }), (req, res) => {
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
        const email = String(req.body?.email || '').trim().toLowerCase();
        const senha = String(req.body?.senha || '');
        const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
        const adminPass = String(process.env.ADMIN_PASSWORD || '');
        const secret = String(process.env.ADMIN_SESSION_SECRET || '').trim();

        if (!adminEmail || !adminPass || !secret) {
          return res.status(503).json({ error: 'Painel administrativo não configurado.' });
        }

        if (!safeEqual(email, adminEmail) || !safeEqual(senha, adminPass)) {
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
        const token = makeToken({ role: 'admin', email: adminEmail, exp: Date.now() + SESSION_MS });
        res.setHeader('Set-Cookie', sessionCookie(req, token, SESSION_MS / 1000));
        console.log('Login administrativo autorizado', { ip });

        // O valor retornado ao JavaScript é apenas um marcador de compatibilidade.
        // O token real fica somente no cookie HttpOnly e não pode ser lido por scripts.
        return res.json({ token: 'cookie-session', admin: { email: adminEmail } });
      } catch (error) {
        console.error('Erro no login administrativo:', error.message);
        return res.status(500).json({ error: 'Não foi possível entrar no painel.' });
      }
    });

    app.post('/api/admin/logout', originalExpress.json({ limit: '2kb' }), (req, res) => {
      securityHeaders(res);
      res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
      return res.json({ ok: true });
    });

    app.get('/api/admin/session', (req, res) => {
      securityHeaders(res);
      const token = parseCookies(req)[COOKIE_NAME];
      return res.json({ authenticated: validToken(token) });
    });

    app.use('/api/admin', (req, res, next) => {
      securityHeaders(res);
      const token = parseCookies(req)[COOKIE_NAME];
      if (!validToken(token)) {
        return res.status(401).json({ error: 'Sessão administrativa inválida ou expirada.' });
      }

      // Mantém compatibilidade com as rotas administrativas existentes,
      // que já validam Authorization no servidor. O token nunca vai ao navegador.
      req.headers.authorization = `Bearer ${token}`;
      return next();
    });

    return app;
  };

  Object.assign(wrappedExpress, originalExpress);
  wrappedExpress.__relogioAdminSecurityPatched = true;
  require.cache[require.resolve('express')].exports = wrappedExpress;
}
