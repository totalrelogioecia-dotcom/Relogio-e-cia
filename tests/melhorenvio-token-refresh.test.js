const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-melhorenvio-auth-'));
const authFile = path.join(dataDir, 'melhorenvio-auth.json');
const originalFetch = global.fetch;
const envNames = [
  'DATA_DIR',
  'MELHORENVIO_ENV',
  'MELHORENVIO_ACCESS_TOKEN',
  'MELHORENVIO_CLIENT_ID',
  'MELHORENVIO_CLIENT_SECRET',
  'MELHORENVIO_REDIRECT_URI',
  'MELHORENVIO_FROM_POSTAL_CODE',
  'MELHORENVIO_USER_AGENT'
];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));

process.env.DATA_DIR = dataDir;
process.env.MELHORENVIO_ENV = 'sandbox';
delete process.env.MELHORENVIO_ACCESS_TOKEN;
process.env.MELHORENVIO_CLIENT_ID = 'client-id';
process.env.MELHORENVIO_CLIENT_SECRET = 'client-secret';
process.env.MELHORENVIO_REDIRECT_URI = 'https://example.test/api/melhorenvio/oauth/callback';
process.env.MELHORENVIO_FROM_POSTAL_CODE = '90035153';
process.env.MELHORENVIO_USER_AGENT = 'Relogio e Cia ([email protected])';

const auth = require('../melhorenvio-auth');
const shipping = require('../shipping-service');

function response(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
  };
}

test.after(() => {
  auth.stopAccessTokenMaintenance();
  global.fetch = originalFetch;
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('duas cotações simultâneas compartilham uma única renovação OAuth', async () => {
  fs.writeFileSync(authFile, JSON.stringify({
    access_token: 'access-antigo',
    refresh_token: 'refresh-antigo',
    expires_at: Date.now() - 1000
  }));

  let refreshRequests = 0;
  global.fetch = async (url, options) => {
    assert.match(String(url), /\/oauth\/token$/);
    assert.match(String(options.body), /grant_type=refresh_token/);
    refreshRequests += 1;
    await new Promise(resolve => setTimeout(resolve, 10));
    return response(200, {
      access_token: 'access-novo',
      refresh_token: 'refresh-novo',
      expires_in: 2592000,
      token_type: 'Bearer'
    });
  };

  const tokens = await Promise.all([auth.getAccessToken(), auth.getAccessToken()]);
  assert.deepEqual(tokens, ['access-novo', 'access-novo']);
  assert.equal(refreshRequests, 1);
  assert.equal(JSON.parse(fs.readFileSync(authFile, 'utf8')).refresh_token, 'refresh-novo');
  assert.equal(auth.status().automatic_refresh_enabled, true);
});

test('resposta Unauthenticated renova o token e repete a requisição uma vez', async () => {
  fs.writeFileSync(authFile, JSON.stringify({
    access_token: 'access-ainda-no-prazo',
    refresh_token: 'refresh-atual',
    expires_at: Date.now() + 20 * 24 * 60 * 60 * 1000
  }));

  const calls = [];
  global.fetch = async (url, options) => {
    const currentUrl = String(url);
    calls.push({ url: currentUrl, authorization: options.headers.Authorization || '' });
    if (currentUrl.endsWith('/oauth/token')) {
      return response(200, {
        access_token: 'access-recuperado',
        refresh_token: 'refresh-rotacionado',
        expires_in: 2592000,
        token_type: 'Bearer'
      });
    }
    if (calls.filter(call => call.url.includes('/shipment/calculate')).length === 1) {
      return response(401, { message: 'Unauthenticated.' });
    }
    return response(200, [{ id: 1, name: 'PAC', price: '20.00' }]);
  };

  const result = await shipping.callMelhorEnvio('/api/v2/me/shipment/calculate', { teste: true });
  assert.equal(result[0].price, '20.00');
  assert.equal(calls.length, 3);
  assert.equal(calls[0].authorization, 'Bearer access-ainda-no-prazo');
  assert.match(calls[1].url, /\/oauth\/token$/);
  assert.equal(calls[2].authorization, 'Bearer access-recuperado');
});
