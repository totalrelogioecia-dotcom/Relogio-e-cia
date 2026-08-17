const crypto = require('crypto');
const {
  baseUrl,
  clientId,
  redirectUri,
  oauthConfigured,
  status,
  exchangeAuthorizationCode,
  disconnect
} = require('./melhorenvio-auth');

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

function stateSecret() {
  return String(process.env.MELHORENVIO_OAUTH_STATE_SECRET || process.env.ADMIN_SESSION_SECRET || '').trim();
}

function signState() {
  const secret = stateSecret();
  if (!secret) throw Object.assign(new Error('ADMIN_SESSION_SECRET não configurado.'), { status: 503 });
  const payload = Buffer.from(JSON.stringify({
    exp: Date.now() + 10 * 60 * 1000,
    nonce: crypto.randomBytes(18).toString('hex')
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyState(value) {
  try {
    const [payload, sig] = String(value || '').split('.');
    if (!payload || !sig || !stateSecret()) return false;
    const expected = crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url');
    if (!safeEqual(sig, expected)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number(data.exp) > Date.now() && Boolean(data.nonce);
  } catch { return false; }
}

function scopes() {
  const configured = String(process.env.MELHORENVIO_SCOPES || '').trim();
  return configured || 'shipping-calculate users-read';
}

function authorizeUrl() {
  const url = new URL(`${baseUrl()}/oauth/authorize`);
  url.searchParams.set('client_id', clientId());
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', signState());
  url.searchParams.set('scope', scopes());
  return url.toString();
}

function callbackPage({ ok, title, message }) {
  const accent = ok ? '#159447' : '#e3262e';
  const button = ok
    ? '<a href="/admin.html">Voltar ao painel administrativo</a>'
    : '<a href="/admin.html">Voltar e tentar novamente</a>';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Relógio e Cia</title><style>body{margin:0;background:#f6f5f2;color:#111;font-family:Arial,sans-serif;display:grid;min-height:100vh;place-items:center}.card{width:min(540px,calc(100vw - 40px));background:#fff;border:1px solid #111;padding:38px;box-sizing:border-box}.eyebrow{font:700 11px monospace;letter-spacing:.18em;color:${accent};text-transform:uppercase}.mark{width:42px;height:4px;background:${accent};margin:18px 0}h1{font-size:28px;margin:0 0 14px}p{line-height:1.6;color:#555}a{display:inline-block;margin-top:18px;background:#111;color:#fff;text-decoration:none;padding:14px 18px;font:700 12px monospace;letter-spacing:.08em;text-transform:uppercase}</style></head><body><main class="card"><div class="eyebrow">Melhor Envio</div><div class="mark"></div><h1>${title}</h1><p>${message}</p>${button}</main></body></html>`;
}

function registerMelhorEnvioOAuthRoutes(app) {
  app.get('/api/admin/melhorenvio/status', admin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ...status(), scopes: scopes() });
  });

  app.get('/api/admin/melhorenvio/authorize-url', admin, (req, res) => {
    try {
      if (!oauthConfigured()) return res.status(503).json({ error: 'Configure Client ID, Client Secret e URL de redirecionamento no Render.' });
      res.set('Cache-Control', 'no-store');
      res.json({ url: authorizeUrl() });
    } catch (error) {
      res.status(Number(error.status) || 500).json({ error: error.message || 'Não foi possível iniciar a autorização.' });
    }
  });

  app.post('/api/admin/melhorenvio/disconnect', admin, (req, res) => {
    disconnect();
    res.json({ ok: true });
  });

  app.get('/api/melhorenvio/oauth/callback', async (req, res) => {
    const errorFromProvider = String(req.query.error || '').trim();
    const errorDescription = String(req.query.error_description || '').trim();
    if (errorFromProvider) {
      return res.status(400).send(callbackPage({
        ok: false,
        title: 'Autorização não concluída',
        message: errorDescription || `O Melhor Envio retornou: ${errorFromProvider}.`
      }));
    }

    const code = String(req.query.code || '').trim();
    const state = String(req.query.state || '').trim();
    if (!code || !verifyState(state)) {
      return res.status(400).send(callbackPage({
        ok: false,
        title: 'Autorização inválida',
        message: 'O código ou o estado de segurança da autorização está ausente ou expirou. Inicie a conexão novamente pelo painel administrativo.'
      }));
    }

    try {
      await exchangeAuthorizationCode(code);
      console.log('Melhor Envio OAuth conectado com sucesso.', { environment: status().environment });
      return res.send(callbackPage({
        ok: true,
        title: 'Melhor Envio conectado!',
        message: 'A conta foi autorizada e o token foi salvo de forma persistente. O site já pode usar a API para calcular fretes.'
      }));
    } catch (error) {
      console.error('Erro OAuth Melhor Envio:', { message: error.message, status: error.status || null, data: error.data || null });
      return res.status(Number(error.status) || 502).send(callbackPage({
        ok: false,
        title: 'Não foi possível conectar',
        message: 'O Melhor Envio recusou a troca do código pelo token. Confira as variáveis do Render e se a URL de redirecionamento é exatamente a mesma cadastrada no aplicativo.'
      }));
    }
  });
}

module.exports = { registerMelhorEnvioOAuthRoutes };
