'use strict';

// Dependency-free syntax and OpenAPI consistency checks; not a full linter.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');
const { getDigiPin, getLatLngFromDigiPin } = require('../src/digipin');
const root = path.resolve(__dirname, '..');
function checkDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) checkDirectory(file);
    else if (file.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
      assert.equal(result.status, 0, `Syntax check failed: ${file}`);
    }
  }
}
for (const directory of ['src', 'scripts', 'test', 'PinID/src', 'PinID/scripts', 'PinID/test', 'PinID/public']) checkDirectory(path.join(root, directory));
assert.equal(spawnSync(process.execPath, ['--check', path.join(root, 'server.js')]).status, 0);
const document = YAML.parse(fs.readFileSync(path.join(root, 'swagger.yaml'), 'utf8'));
assert.equal(document.openapi, '3.0.0');
function visit(value) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref) {
    assert.ok(value.$ref.startsWith('#/'), 'Only local references expected');
    let target = document;
    for (const component of value.$ref.slice(2).split('/')) {
      target = target?.[component.replace(/~1/g, '/').replace(/~0/g, '~')];
    }
    assert.ok(target, `Unresolved OpenAPI reference: ${value.$ref}`);
  }
  for (const child of Object.values(value)) visit(child);
}
visit(document);
for (const operation of ['encode', 'decode']) {
  for (const method of ['get', 'post']) {
    assert.ok(document.paths[`/digipin/${operation}`][method].responses['200']);
    assert.ok(document.paths[`/digipin/${operation}`][method].responses['400']);
  }
}
const encode = document.paths['/digipin/encode'];
const decode = document.paths['/digipin/decode'];
for (const method of ['get', 'post']) {
  const encodeInput = method === 'post'
    ? encode[method].requestBody.content['application/json'].example
    : Object.fromEntries(encode[method].parameters.map(parameter => [parameter.name, parameter.schema.example]));
  assert.deepEqual(encode[method].responses['200'].content['application/json'].example, {
    digipin: getDigiPin(encodeInput.latitude, encodeInput.longitude),
  }, 'OpenAPI encode example must match the existing engine');
  const decodeInput = method === 'post'
    ? decode[method].requestBody.content['application/json'].example.digipin
    : decode[method].parameters.find(parameter => parameter.name === 'digipin').schema.example;
  assert.deepEqual(decode[method].responses['200'].content['application/json'].example,
    getLatLngFromDigiPin(decodeInput), 'OpenAPI decode example must show the grid centre');
}
console.log('JavaScript syntax and OpenAPI local-reference checks passed.');
