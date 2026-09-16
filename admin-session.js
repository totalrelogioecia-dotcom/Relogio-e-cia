const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COOKIE_NAME = 'reloja_admin_session';
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const ADMIN_USERS_FILE = path.join(DATA, 'admin-users.json');
const ACCESS_LEVELS = new Set(['owner', 'manager', 'atendimento']);

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeAccessLevel(value) {
  const level = String(value || '').trim().toLowerCase();
  return ACCESS_LEVELS.has(level) ? level : 'atendimento';
}

function parseCookies(req) {
  const result = {};
  for (const part of String(req?.headers?.cookie || '').split(';')) {
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

function readAdminUsers() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ADMIN_USERS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function authenticatedToken(value) {
  try {
    const [body, signature] = String(value || '').split('.');
    const secret = String(process.env.ADMIN_SESSION_SECRET || '').trim();
    if (!body || !signature || !secret) return null;

    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (!safeEqual(signature, expected)) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.role !== 'admin' || Number(payload.exp) <= Date.now() || !payload.user_id) return null;

    const user = readAdminUsers().find(item => String(item.id) === String(payload.user_id));
    if (!user || user.active === false) return null;
    if (Number(user.session_version || 1) !== Number(payload.session_version || 1)) return null;

    return {
      ...payload,
      email: normalizeEmail(user.email),
      name: String(user.name || '').trim().replace(/\s+/g, ' ').slice(0, 100) || 'Administrador',
      access_level: normalizeAccessLevel(user.access_level)
    };
  } catch {
    return null;
  }
}

function tokenFromRequest(req) {
  const cookieToken = parseCookies(req)[COOKIE_NAME];
  if (cookieToken) return cookieToken;
  return String(req?.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

function authenticatedRequest(req) {
  return authenticatedToken(tokenFromRequest(req));
}

module.exports = {
  COOKIE_NAME,
  ADMIN_USERS_FILE,
  safeEqual,
  normalizeEmail,
  normalizeAccessLevel,
  parseCookies,
  readAdminUsers,
  authenticatedToken,
  authenticatedRequest,
  tokenFromRequest
};
