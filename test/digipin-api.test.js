'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const app = require('../src/app');
const vectors = require('./fixtures/digipin-vectors.json');
let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
async function request(operation, method, input) {
  const options = { method, signal: AbortSignal.timeout(5000) };
  let url = `${base}/api/digipin/${operation}`;
  if (method === 'GET') url += `?${new URLSearchParams(input)}`;
  else {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(input);
  }
  const response = await fetch(url, options);
  return { response, body: await response.json() };
}
for (const method of ['GET', 'POST']) {
  test(`${method} encode preserves published example and canonical response`, async () => {
    for (const vector of vectors.encode) {
      const { response, body } = await request('encode', method, {
        latitude: vector.latitude, longitude: vector.longitude,
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /application\/json/);
      assert.deepEqual(body, { digipin: vector.digipin });
    }
  });
  test(`${method} decode preserves string-valued, rounded cell centres`, async () => {
    for (const vector of vectors.decode) {
      const { response, body } = await request('decode', method, { digipin: vector.digipin });
      assert.equal(response.status, 200);
      assert.deepEqual(body, { latitude: vector.latitude, longitude: vector.longitude });
    }
  });
  test(`${method} encode rejects out-of-range coordinates with legacy error shape`, async () => {
    for (const [input, error] of [
      [{ latitude: 2, longitude: 77 }, 'Latitude out of range'],
      [{ latitude: 39, longitude: 77 }, 'Latitude out of range'],
      [{ latitude: 13, longitude: 63 }, 'Longitude out of range'],
      [{ latitude: 13, longitude: 100 }, 'Longitude out of range'],
    ]) {
      const { response, body } = await request('encode', method, input);
      assert.equal(response.status, 400);
      assert.deepEqual(body, { error });
    }
  });
  test(`${method} decode rejects invalid length, alphabet, separators and missing code`, async () => {
    for (const input of [{}, ...['', '4P3-JK8-3M28', '4P3 JK83 M28', 'AAAAAAAAAA', '4P3JK83M2'].map(digipin => ({ digipin }))]) {
      const { response, body } = await request('decode', method, input);
      assert.equal(response.status, 400);
      assert.match(body.error, /^Invalid DIGIPIN\./);
      assert.deepEqual(Object.keys(body), ['error']);
    }
  });
  test(`${method} decode retains lowercase and outer-whitespace compatibility`, async () => {
    const { response, body } = await request('decode', method, { digipin: ' 4p3jk83m28 ' });
    assert.equal(response.status, 200);
    assert.deepEqual(body, { latitude: '12.972563', longitude: '77.592009' });
  });
}
test('POST decode rejects non-string code', async () => {
  for (const digipin of [null, 123, {}, []]) {
    const { response, body } = await request('decode', 'POST', { digipin });
    assert.equal(response.status, 400);
    assert.match(body.error, /provided as a string/);
  }
});
test('malformed JSON is rejected by Express before route handling', async () => {
  const response = await fetch(`${base}/api/digipin/encode`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 400);
  await response.text();
});
test('unknown routes and proposed PinID routes are absent', async () => {
  for (const url of ['/api/digipin/unknown', '/api/v1/identities', '/api/v1/locations', '/api/v1/invitations']) {
    const response = await fetch(`${base}${url}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 404);
    await response.text();
  }
});
test('documentation and existing legal pages remain reachable', async () => {
  for (const url of ['/api-docs/', '/privacy-policy', '/disclaimer', '/docs/DIGIPIN_Technical_Document.md']) {
    const response = await fetch(`${base}${url}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    assert.ok((await response.text()).length > 0);
  }
});
