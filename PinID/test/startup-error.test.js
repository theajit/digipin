'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {startupHint}=require('../src/startup-error');
test('startup diagnostics identify known configuration failures without secrets',()=>{
  assert.match(startupHint(new Error('PinID Lite requires a 32-byte base64url PINID_ENCRYPTION_KEY')),/PINID_ENCRYPTION_KEY/);
  assert.match(startupHint({code:'ENOENT'}),/marker is missing/);
  assert.match(startupHint({code:'EACCES'}),/not writable/);
  assert.match(startupHint({code:'ERR_INVALID_URL'}),/PINID_ORIGIN/);
  assert.match(startupHint(new Error('PinID Lite encryption key does not match database')),/Restore the original key/);
});
test('untrusted exception contents are never included in startup diagnostics',()=>{
  for(const code of [undefined,'ENOENT','EACCES','ERR_INVALID_URL','ERR_SQLITE_ERROR']){
    const value=startupHint({code,message:'secret-coordinate-token',path:'private-path'});
    assert.ok(!value.includes('secret-coordinate-token'));assert.ok(!value.includes('private-path'));
  }
});
