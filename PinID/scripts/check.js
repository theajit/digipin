'use strict';
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process'); const root = path.resolve(__dirname, '..');
function check(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) check(file);
    else if (file.endsWith('.js')) assert.equal(spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' }).status, 0, file);
  }
}
for (const dir of ['src','scripts','test','public','vendor']) check(path.join(root, dir));
assert.equal(spawnSync(process.execPath, ['--check', path.join(root, 'server.js')]).status, 0);
console.log('Independent PinID JavaScript syntax checks passed.');
