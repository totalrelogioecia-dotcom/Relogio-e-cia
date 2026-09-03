const fs = require('fs');
const path = require('path');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const AUTH_FILE = path.join(DATA, 'melhorenvio-auth.json');
const REQUEST_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const MAINTENANCE_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAINTENANCE_INTERVAL_MS = 12 * 60 * 60 * 1000;

let refreshPromise = null;
let maintenanceTimer = null;

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

async function flushAuthPersistence() {
  // No fluxo real, startup.js carrega o armazenamento antes deste módulo.
  // Consultar o cache evita acoplar testes unitários do frete ao driver `pg`.
  const storePath = require.resolve('./persistent-store');
  const store = require.cache[storePath]?.exports;
  if (typeof store?.flushPersistentStore === 'function') await store.flushPersistentStore();
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

function tokenLooksUsable(auth, minimumValidityMs = REQUEST_REFRESH_WINDOW_MS) {
  if (!auth?.access_token) return false;
  const expiresAt = Number(auth.expires_at || 0);
  if (!expiresAt) return false;
  return expiresAt - Date.now() > Math.max(0, Number(minimumValidityMs) || 0);
}

function status() {
  const auth = readAuth();
  const staticAccessToken = staticToken();
  const oauthConnected = Boolean(oauthConfigured() && auth.refresh_token);
  const authMode = oauthConnected ? 'oauth' : (staticAccessToken ? 'static-token' : (auth.access_token || auth.refresh_token ? 'oauth' : 'none'));
  return {
    environment: envMode(),
    oauth_configured: oauthConfigured(),
    connected: Boolean(staticAccessToken || auth.access_token || auth.refresh_token),
    auth_mode: authMode,
    automatic_refresh_enabled: authMode === 'oauth' && Boolean(auth.refresh_token),
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
  // O interceptor do armazenamento persistente envia esta escrita ao PostgreSQL.
  // Aguardamos a fila para não perder um refresh_token rotacionado em um restart.
  await flushAuthPersistence();
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

function refreshAccessToken() {
  // O Melhor Envio pode rotacionar o refresh_token. Uma única promessa impede
  // que duas cotações simultâneas tentem consumir o mesmo token.
  if (refreshPromise) return refreshPromise;

  const operation = (async () => {
    const current = readAuth();
    if (!current.refresh_token) {
      const error = new Error('A conexão com o Melhor Envio precisa ser autorizada novamente.');
      error.status = 401;
      error.code = 'melhor_envio_reauthorization_required';
      throw error;
    }
    return requestToken({
      grant_type: 'refresh_token',
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: current.refresh_token
    });
  })();

  refreshPromise = operation;
  operation.finally(() => {
    if (refreshPromise === operation) refreshPromise = null;
  }).catch(() => {});
  return operation;
}

async function getAccessToken(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const minimumValidityMs = Number.isFinite(Number(options.minimumValidityMs))
    ? Math.max(0, Number(options.minimumValidityMs))
    : REQUEST_REFRESH_WINDOW_MS;
  const current = readAuth();
  // Quando existe uma autorização OAuth completa, ela tem prioridade sobre o
  // token fixo legado para que a renovação permaneça realmente automática.
  if (oauthConfigured() && current.refresh_token) {
    if (!forceRefresh && tokenLooksUsable(current, minimumValidityMs)) return String(current.access_token);
    const refreshed = await refreshAccessToken();
    return String(refreshed.access_token);
  }

  const envToken = staticToken();
  if (envToken && !forceRefresh) return envToken;
  if (!forceRefresh && tokenLooksUsable(current, minimumValidityMs)) return String(current.access_token);

  if (forceRefresh && envToken) {
    const error = new Error('O token fixo do Melhor Envio expirou. Autorize a conta por OAuth no painel administrativo para ativar a renovação automática.');
    error.status = 401;
    error.code = 'melhor_envio_reauthorization_required';
    throw error;
  }

  const error = new Error('Autorize a conta do Melhor Envio antes de calcular o frete.');
  error.status = 503;
  error.code = 'melhor_envio_not_connected';
  throw error;
}

async function maintainAccessToken() {
  const current = readAuth();
  if (!oauthConfigured() || !current.refresh_token) {
    return { checked: false, refreshed: false, reason: 'oauth_not_connected' };
  }
  if (tokenLooksUsable(current, MAINTENANCE_REFRESH_WINDOW_MS)) {
    return { checked: true, refreshed: false, expires_at: current.expires_at || null };
  }

  const refreshed = await refreshAccessToken();
  return { checked: true, refreshed: true, expires_at: refreshed.expires_at || null };
}

function startAccessTokenMaintenance(options = {}) {
  if (maintenanceTimer) return maintenanceTimer;
  const configuredInterval = Number(options.intervalMs);
  const intervalMs = Number.isFinite(configuredInterval) && configuredInterval > 0
    ? configuredInterval
    : MAINTENANCE_INTERVAL_MS;

  const run = () => maintainAccessToken()
    .then(result => {
      if (result.refreshed) console.log('Token OAuth do Melhor Envio renovado preventivamente.');
    })
    .catch(error => {
      // Uma indisponibilidade do provedor não deve derrubar a loja. A próxima
      // execução ou cotação tentará novamente e o painel seguirá como fallback.
      console.error('Não foi possível renovar preventivamente o token do Melhor Envio:', {
        message: error.message,
        status: error.status || null
      });
    });

  run();
  maintenanceTimer = setInterval(run, intervalMs);
  maintenanceTimer.unref?.();
  return maintenanceTimer;
}

function stopAccessTokenMaintenance() {
  if (!maintenanceTimer) return;
  clearInterval(maintenanceTimer);
  maintenanceTimer = null;
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
  refreshAccessToken,
  getAccessToken,
  maintainAccessToken,
  startAccessTokenMaintenance,
  stopAccessTokenMaintenance,
  disconnect
};
