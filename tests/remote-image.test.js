const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchAllowedImage } = require('../remote-image');
const { fetchAllowedText } = require('../remote-text');

test('proxy não segue redirecionamento para host fora da lista', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const calls = [];
  global.fetch = async url => {
    calls.push(String(url));
    return new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1/private' }
    });
  };

  const image = await fetchAllowedImage('https://images.example/watch.png', {
    isAllowed: value => new URL(value).hostname === 'images.example'
  });
  assert.equal(image, null);
  assert.deepEqual(calls, ['https://images.example/watch.png']);
});

test('proxy rejeita SVG e corpo acima do limite', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const allowed = () => true;

  global.fetch = async () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } });
  assert.equal(await fetchAllowedImage('https://images.example/watch.svg', { isAllowed: allowed }), null);

  global.fetch = async () => new Response(Buffer.alloc(32), { headers: { 'content-type': 'image/png' } });
  assert.equal(await fetchAllowedImage('https://images.example/watch.png', { isAllowed: allowed, maxBytes: 16 }), null);
});

test('proxy aceita imagem permitida dentro do limite', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => new Response(Buffer.from([1, 2, 3]), { headers: { 'content-type': 'image/png' } });
  const image = await fetchAllowedImage('https://images.example/watch.png', { isAllowed: () => true, maxBytes: 16 });
  assert.equal(image.type, 'image/png');
  assert.deepEqual(image.bytes, Buffer.from([1, 2, 3]));
});

test('consulta HTML rejeita redirecionamento externo, tipo errado e corpo grande', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const allowed = value => new URL(value).hostname === 'www.casio.com';

  global.fetch = async () => new Response(null, {
    status: 302,
    headers: { location: 'http://127.0.0.1/private' }
  });
  assert.equal(await fetchAllowedText('https://www.casio.com/watch', { isAllowed: allowed }), null);

  global.fetch = async () => new Response('{}', {
    headers: { 'content-type': 'application/json' }
  });
  assert.equal(await fetchAllowedText('https://www.casio.com/watch', { isAllowed: allowed }), null);

  global.fetch = async () => new Response('texto maior que o limite', {
    headers: { 'content-type': 'text/html' }
  });
  assert.equal(await fetchAllowedText('https://www.casio.com/watch', {
    isAllowed: allowed,
    maxBytes: 8
  }), null);
});

test('consulta HTML aceita página oficial dentro do limite', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => new Response('<!doctype html><title>Relógio</title>', {
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
  const result = await fetchAllowedText('https://www.casio.com/watch', {
    isAllowed: () => true,
    maxBytes: 128
  });
  assert.equal(result.type, 'text/html');
  assert.match(result.text, /Relógio/);
});
