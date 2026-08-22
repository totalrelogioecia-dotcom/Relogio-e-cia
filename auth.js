const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const USERS = path.join(DATA, 'users.json');
const RESET_TOKENS = path.join(DATA, 'password-reset-tokens.json');
fs.mkdirSync(DATA, { recursive: true });

const read = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
};
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, encoded) {
  try {
    const [algorithm, saltHex, hashHex] = String(encoded || '').split(':');
    if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch { return false; }
}

function cleanUser(user) {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    telefone: user.telefone || null,
    identificacao: user.identificacao || null,
    endereco: user.endereco || null,
    created_at: user.created_at || null
  };
}

function authToken(user) {
  const secret = String(process.env.AUTH_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || '').trim();
  if (!secret) throw new Error('AUTH_SESSION_SECRET não configurado.');
  const body = Buffer.from(JSON.stringify({ sub: user.id, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function validAuthToken(token) {
  try {
    const secret = String(process.env.AUTH_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || '').trim();
    if (!secret) return null;
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.sub || payload.exp <= Date.now()) return null;
    return read(USERS, []).find(u => u.id === payload.sub) || null;
  } catch { return null; }
}

function parseCookies(header) {
  return String(header || '').split(';').reduce((acc, part) => {
    const i = part.indexOf('=');
    if (i < 0) return acc;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function tokenFromRequest(req) {
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (bearer) return bearer;
  return parseCookies(req.headers.cookie).reloja_auth || '';
}

function userFromRequest(req) {
  return validAuthToken(tokenFromRequest(req));
}

function setAuthCookie(res, token) {
  const secure = String(process.env.PUBLIC_URL || '').startsWith('https://');
  const parts = [
    `reloja_auth=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=604800'
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearAuthCookie(res) {
  const secure = String(process.env.PUBLIC_URL || '').startsWith('https://');
  const parts = ['reloja_auth=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function emailHtml(nome, resetUrl) {
  const safeNome = String(nome || 'cliente').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c]));
  const safeUrl = String(resetUrl).replace(/"/g, '&quot;');
  return `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;background:#f5f3ef;padding:32px;color:#171717"><div style="max-width:560px;margin:auto;background:#fff;padding:32px;border:1px solid #ddd"><h2>Relógio e Cia</h2><p>Olá, ${safeNome}.</p><p>Recebemos uma solicitação para redefinir a senha da sua conta.</p><p><a href="${safeUrl}" style="display:inline-block;background:#171717;color:#fff;padding:12px 18px;text-decoration:none">Redefinir minha senha</a></p><p>Este link expira em 30 minutos. Se você não solicitou a alteração, ignore este e-mail.</p></div></body></html>`;
}

async function sendResetEmail(user, token) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.RESEND_FROM || '').trim();
  const base = String(process.env.PUBLIC_URL || '').replace(/\/+$/, '');
  if (!apiKey || !from || !base.startsWith('https://')) throw new Error('Recuperação por e-mail não configurada.');
  const resetUrl = `${base}/conta.html?reset_token=${encodeURIComponent(token)}`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [user.email], subject: 'Redefinição de senha — Relógio e Cia', html: emailHtml(user.nome, resetUrl) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Resend recuperação de senha:', { statusCode: response.status, ...data });
    const error = new Error(data?.message || 'Não foi possível enviar o e-mail de recuperação.');
    error.status = response.status;
    error.code = data?.name || null;
    throw error;
  }
  console.log('E-mail de recuperação enviado:', { to: user.email, resend_id: data?.id || null });
}

const forgotAttempts = new Map();
function tooSoon(email) {
  const now = Date.now();
  const last = forgotAttempts.get(email) || 0;
  if (now - last < 60_000) return true;
  forgotAttempts.set(email, now);
  return false;
}

function registerAuthRoutes(app) {
  app.use('/api/auth', express.json({ limit: '1mb' }));

  app.post('/api/auth/register', (req, res) => {
    try {
      const { nome, email, senha, telefone, identificacao, endereco } = req.body || {};
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!nome || !normalizedEmail || !senha || String(senha).length < 8) return res.status(400).json({ error: 'Nome, e-mail e senha com pelo menos 8 caracteres são obrigatórios.' });
      if (!telefone?.area_code || !telefone?.number) return res.status(400).json({ error: 'Telefone inválido.' });
      if (!endereco?.zip_code || !endereco?.street_name || !endereco?.street_number || !endereco?.neighborhood || !endereco?.city_name || !endereco?.state_code) return res.status(400).json({ error: 'Endereço completo é obrigatório.' });
      if (identificacao?.number && String(identificacao.number).replace(/\D/g, '').length !== 11) return res.status(400).json({ error: 'CPF inválido.' });
      const users = read(USERS, []);
      if (users.some(u => u.email === normalizedEmail)) return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' });
      const user = {
        id: crypto.randomUUID(),
        nome: String(nome).trim().slice(0, 120),
        email: normalizedEmail.slice(0, 180),
        password_hash: hashPassword(senha),
        telefone: {
          area_code: String(telefone.area_code).replace(/\D/g, '').slice(0, 4),
          number: String(telefone.number).replace(/\D/g, '').slice(0, 15)
        },
        identificacao: identificacao?.number ? { type: 'CPF', number: String(identificacao.number).replace(/\D/g, '').slice(0, 11) } : null,
        endereco: {
          zip_code: String(endereco.zip_code).replace(/\D/g, '').slice(0, 8),
          street_name: String(endereco.street_name).trim().slice(0, 120),
          street_number: String(endereco.street_number).trim().slice(0, 20),
          complement: String(endereco.complement || '').trim().slice(0, 120),
          neighborhood: String(endereco.neighborhood).trim().slice(0, 120),
          city_name: String(endereco.city_name).trim().slice(0, 120),
          state_name: String(endereco.state_name || endereco.state_code).trim().slice(0, 120),
          state_code: String(endereco.state_code).trim().slice(0, 2).toUpperCase(),
          country_name: 'Brasil'
        },
        created_at: new Date().toISOString()
      };
      users.push(user);
      write(USERS, users);
      console.log('Conta criada no servidor:', { id: user.id, email: user.email });
      const token = authToken(user);
      setAuthCookie(res, token);
      res.status(201).json({ token, user: cleanUser(user) });
    } catch (error) {
      console.error('Erro /api/auth/register:', error);
      res.status(500).json({ error: error.message || 'Erro ao criar conta.' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const senha = String(req.body?.senha || '');
      const user = read(USERS, []).find(u => u.email === email);
      if (!user || !verifyPassword(senha, user.password_hash)) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      const token = authToken(user);
      setAuthCookie(res, token);
      res.json({ token, user: cleanUser(user) });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Erro ao entrar.' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    clearAuthCookie(res);
    res.status(204).end();
  });

  app.get('/api/auth/me', (req, res) => {
    const user = userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    res.json({ user: cleanUser(user) });
  });

  app.post('/api/auth/forgot-password', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const generic = { message: 'Se existir uma conta com esse e-mail, enviaremos um link para redefinir a senha.' };
    if (!email) return res.status(400).json({ error: 'Informe seu e-mail.' });
    if (tooSoon(email)) return res.status(429).json({ error: 'Aguarde um minuto antes de solicitar outro link.' });
    const user = read(USERS, []).find(u => u.email === email);
    if (!user) {
      console.log('Recuperação solicitada para e-mail não cadastrado:', email);
      return res.json(generic);
    }

    const tokens = read(RESET_TOKENS, []).filter(t => t.expires_at > Date.now() && t.email !== email);
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    tokens.push({ token_hash: tokenHash, user_id: user.id, email, expires_at: Date.now() + 30 * 60 * 1000 });
    write(RESET_TOKENS, tokens);

    try {
      await sendResetEmail(user, rawToken);
      return res.json(generic);
    } catch (error) {
      write(RESET_TOKENS, read(RESET_TOKENS, []).filter(t => t.token_hash !== tokenHash));
      console.error('Erro /api/auth/forgot-password:', error.message);
      if (error.status === 403 && /testing emails|own email address|verify a domain/i.test(error.message)) {
        return res.status(403).json({
          error: 'O envio de e-mails está em modo de teste. Por enquanto, use o mesmo e-mail cadastrado na conta do Resend. Para enviar recuperação a outros clientes será necessário verificar um domínio próprio.'
        });
      }
      return res.status(503).json({ error: 'Não foi possível enviar o e-mail de recuperação. Verifique a configuração do serviço de e-mail.' });
    }
  });

  app.post('/api/auth/reset-password', (req, res) => {
    try {
      const token = String(req.body?.token || '').trim();
      const senha = String(req.body?.senha || '');
      if (!token || senha.length < 8) return res.status(400).json({ error: 'O link e uma nova senha com pelo menos 8 caracteres são obrigatórios.' });
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const tokens = read(RESET_TOKENS, []);
      const index = tokens.findIndex(t => t.token_hash === tokenHash && t.expires_at > Date.now());
      if (index < 0) return res.status(400).json({ error: 'Link inválido ou expirado. Solicite uma nova recuperação.' });
      const users = read(USERS, []);
      const userIndex = users.findIndex(u => u.id === tokens[index].user_id);
      if (userIndex < 0) return res.status(400).json({ error: 'Conta não encontrada.' });
      users[userIndex].password_hash = hashPassword(senha);
      users[userIndex].updated_at = new Date().toISOString();
      write(USERS, users);
      write(RESET_TOKENS, tokens.filter(t => t.user_id !== users[userIndex].id));
      const newToken = authToken(users[userIndex]);
      setAuthCookie(res, newToken);
      res.json({ token: newToken, user: cleanUser(users[userIndex]) });
    } catch (error) {
      console.error('Erro /api/auth/reset-password:', error);
      res.status(500).json({ error: 'Não foi possível redefinir a senha.' });
    }
  });
}

module.exports = { registerAuthRoutes, validAuthToken, cleanUser, userFromRequest };
