'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {loadConfig}=require('../src/config');
test('enable flag accepts boolean true and case-insensitive trimmed true without bypassing required configuration',()=>{
  for(const value of [true,'true','TRUE','True',' true ','\tTRUE\n']) {
    assert.throws(()=>loadConfig({PINID_LITE_ENABLED:value}),/requires a 32-byte base64url PINID_ENCRYPTION_KEY/);
  }
});
test('false missing and other truthy-looking enable flags remain disabled',()=>{
  for(const value of [undefined,false,'false','FALSE','0','1','yes','on','',1,{}]) {
    assert.equal(loadConfig({PINID_LITE_ENABLED:value}),null);
  }
});
