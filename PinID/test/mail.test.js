'use strict';const {test}=require('node:test');const assert=require('node:assert/strict');const {mailConfig}=require('../src/mail');const {token}=require('../src/security');
test('Resend requires explicit enablement, valid server-side key and sender configuration',()=>{
 assert.equal(mailConfig({}),undefined);assert.throws(()=>mailConfig({PINID_EMAIL_ENABLED:'TRUE'}),/configuration invalid/);const key=`re_${token()}`;assert.deepEqual(mailConfig({PINID_EMAIL_ENABLED:'true',RESEND_API_KEY:key,PINID_EMAIL_FROM:'pinid@example.test'}),{key,from:'pinid@example.test'});for(const from of ['someone@example.test\r\nCC:bad','http://example.test',''])assert.throws(()=>mailConfig({PINID_EMAIL_ENABLED:'true',RESEND_API_KEY:key,PINID_EMAIL_FROM:from}));
});
