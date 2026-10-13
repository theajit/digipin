'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getDigiPin, getLatLngFromDigiPin } = require('../vendor/indiapost/digipin');
const vectors = require('./fixtures/digipin-vectors.json');

for (const vector of vectors.encode) {
  test(`encode: ${vector.source}`, () => {
    assert.equal(getDigiPin(vector.latitude, vector.longitude), vector.digipin);
  });
}
for (const vector of vectors.decode) {
  test(`decode: ${vector.digipin}`, () => {
    assert.deepEqual(getLatLngFromDigiPin(vector.digipin), {
      latitude: vector.latitude, longitude: vector.longitude,
    });
  });
}
test('decode accepts lowercase and outer whitespace, rejects internal separators', () => {
  assert.deepEqual(getLatLngFromDigiPin(' 4p3jk83m28 '), getLatLngFromDigiPin('4P3JK83M28'));
  for (const value of ['4P3-JK8-3M28', '4P3 JK83 M28', 'AAAAAAAAAA', '', '4P3JK83M2']) {
    assert.throws(() => getLatLngFromDigiPin(value), /Invalid DIGIPIN/);
  }
});
test('decode rejects non-string inputs', () => {
  for (const value of [null, undefined, 123, {}, []]) {
    assert.throws(() => getLatLngFromDigiPin(value), /provided as a string/);
  }
});
test('encode rejects values outside inclusive geographic bounds', () => {
  for (const value of [2.49, 38.51, -Infinity, Infinity]) {
    assert.throws(() => getDigiPin(value, 77), /Latitude out of range/);
  }
  for (const value of [63.49, 99.51, -Infinity, Infinity]) {
    assert.throws(() => getDigiPin(13, value), /Longitude out of range/);
  }
});
test('every approved symbol decodes and its cell centre re-encodes', () => {
  for (const symbol of '23456789CJKLMPFT') {
    const code = symbol.repeat(10);
    const centre = getLatLngFromDigiPin(code);
    assert.equal(getDigiPin(Number(centre.latitude), Number(centre.longitude)), code);
  }
});
test('deterministic grid samples stay within half a cell plus rounding error', () => {
  const halfCell = 36 / (4 ** 10) / 2 + 0.0000005;
  for (let i = 0; i < 256; i++) {
    const latitude = 2.5 + ((i * 73) % 257) / 257 * 36;
    const longitude = 63.5 + ((i * 151) % 257) / 257 * 36;
    const code = getDigiPin(latitude, longitude);
    assert.match(code, /^[23456789CJKLMPFT]{10}$/);
    const centre = getLatLngFromDigiPin(code);
    assert.ok(Math.abs(latitude - Number(centre.latitude)) <= halfCell);
    assert.ok(Math.abs(longitude - Number(centre.longitude)) <= halfCell);
    assert.equal(getDigiPin(Number(centre.latitude), Number(centre.longitude)), code);
  }
});
