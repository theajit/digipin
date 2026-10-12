'use strict';
// Characterization only: these tests deliberately expose unsafe legacy behavior.
// Correcting it requires an explicit compatibility decision and updated tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const app = require('../src/app');
test('AUD-01: GET parseFloat accepts a numeric prefix with invalid suffix', async () => {
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/digipin/encode?latitude=12.972579junk&longitude=77.592015junk`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { digipin: '4P3JK83M28' });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
test('AUD-01: missing GET longitude is accepted and emits undefined segments', async () => {
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/digipin/encode?latitude=13`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { digipin: 'undefined'.repeat(10) });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
test.todo('AUD-01 remediation: all coordinate inputs must be finite numeric values');
test.todo('AUD-02 remediation: requests and errors must never log precise location data');
