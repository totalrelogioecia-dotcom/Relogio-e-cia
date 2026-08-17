const fs = require('fs');
const path = require('path');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const AUTH_FILE = path.join(DATA, 'melhorenvio-auth.json');

function readAuth() {
  try {
    const value = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writeAuth(value) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(value || {}, null, 2), 'utf8');
}

function envMode() {
  return String(process.env.MELHORENVIO_ENV || 'sandbox').trim().toLowerCase() === 'production'
    ? 'production'
    : 'sandbox';
}

function baseUrl() {
  return envMode() === 'production'
    ? 'https://melhorenvio.com.br'
    : 'https://sandbox.melhorenvio.com.br';
}

function clientId() {
  return String(process.env.MELHORENVIO_CLIENT_ID || '').trim();
}

function clientSecret() {
  return String(process.env.MELHORENVIO_CLIENT_SECRET || '').trim();
}

function redirectUri() {
  return String(process.env.MELHORENVIO_REDIRECT_URI || '').trim();
}

function userAgent() {
  return String(process.env.MELHORENVIO_USER_AGENT || 'Relogio e Cia (totalrelogioecia@gmail.com)').trim();
}

function oauthConfigured() {
  return Boolean(clientId() && clientSecret() && redirectUri() && userAgent());
}

function staticToken() {
  return String(process.env.MELHORENVIO_ACCESS_TOKEN || '').trim();
}

function tokenLooksUsable(auth) {
  if (!auth?.access_token) return false;
  const expiresAt = Number(auth.expires_at || 0);
  if (!expiresAt) return true;
  return expiresAt - Date.now() > 5 * 60 * 1000;
}

function status() {
  const auth = readAuth();
  const staticAccessToken = staticToken();
  return {
    environment: envMode(),
    oauth_configured: oauthConfigured(),
    connected: Boolean(staticAccessToken || auth.access_token || auth.refresh_token),
    auth_mode: staticAccessToken ? 'static-token' : (auth.access_token || auth.refresh_token ? 'oauth' : 'none'),
    access_token_available: Boolean(staticAccessToken || auth.access_token),
    refresh_token_available: Boolean(auth.refresh_token),
    expires_at: auth.expires_at || null,
    client_id_configured: Boolean(clientId()),
    client_secret_configured: Boolean(clientSecret()),
    redirect_uri_configured: Boolean(redirectUri())
  };
}

async function requestToken(params) {
  if (!oauthConfigured()) {
    const error = new Error('Client ID, Client Secret e URL de redirecionamento do Melhor Envio ainda não estão configurados.');
    error.status = 503;
    throw error;
  }

  const body = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== '') body.set(key, String(value));
  });

  const response = await fetch(`${baseUrl()}/oauth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent()
    },
    body: body.toString(),
    signal: AbortSignal.timeout(15000)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    const error = new Error(data?.message || data?.error_description || data?.error || `Melhor Envio respondeu com status ${response.status}.`);
    error.status = response.status || 502;
    error.data = data;
    throw error;
  }

  const expiresIn = Number(data.expires_in || 2592000);
  const previous = readAuth();
  const saved = {
    ...previous,
    token_type: String(data.token_type || 'Bearer'),
    access_token: String(data.access_token),
    refresh_token: data.refresh_token ? String(data.refresh_token) : (previous.refresh_token || null),
    expires_in: Number.isFinite(expiresIn) ? expiresIn : 2592000,
    expires_at: Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 2592000) * 1000,
    scope: data.scope || previous.scope || null,
    updated_at: new Date().toISOString()
  };
  writeAuth(saved);
  return saved;
}

async function exchangeAuthorizationCode(code) {
  return requestToken({
    grant_type: 'authorization_code',
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri(),
    code: String(code || '').trim()
  });
}

async function refreshAccessToken() {
  const current = readAuth();
  if (!current.refresh_token) {
    const error = new Error('A conexão com o Melhor Envio precisa ser autorizada novamente.');
    error.status = 401;
    throw error;
  }
  return requestToken({
    grant_type: 'refresh_token',
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: current.refresh_token
  });
}

async function getAccessToken() {
  const envToken = staticToken();
  if (envToken) return envToken;

  const current = readAuth();
  if (tokenLooksUsable(current)) return String(current.access_token);
  if (current.refresh_token) {
    const refreshed = await refreshAccessToken();
    return String(refreshed.access_token);
  }

  const error = new Error('Autorize a conta do Melhor Envio antes de calcular o frete.');
  error.status = 503;
  error.code = 'melhor_envio_not_connected';
  throw error;
}

function disconnect() {
  writeAuth({});
}

module.exports = {
  AUTH_FILE,
  envMode,
  baseUrl,
  clientId,
  clientSecret,
  redirectUri,
  userAgent,
  oauthConfigured,
  status,
  exchangeAuthorizationCode,
  getAccessToken,
  disconnect
};
