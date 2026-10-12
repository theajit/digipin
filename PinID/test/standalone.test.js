'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const { once } = require('node:events');
const { createApp } = require('../src/app'); const { token } = require('../src/security');
test('standalone app is fail-closed when disabled', async () => {
  const app = createApp(null); const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
  try {
    for (const route of ['/','/healthz','/api/me']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`);
      assert.equal(response.status,503); await response.text();
    }
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
test('independent UI/API, legacy prefix and health use one private store', async () => {
  const root = path.resolve(__dirname,'../test-data/runs'); fs.mkdirSync(root,{recursive:true});
  const directory = fs.mkdtempSync(path.join(root,'standalone-'));
  const config = { directory, encryptionKey: Buffer.from(token(),'base64url'), sessionSecret:token(),adminSecret:token(),
    origin:'https://pinid.test', secure:true,sessionSeconds:3600 };
  const app = createApp(config); const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of ['/api/digipin/encode','/api/digipin/decode','/api-docs/']) {
      const response=await fetch(base+route); assert.equal(response.status,route.startsWith('/api/')?401:404,route); await response.text();
    }
    for (const route of ['/','/app.js','/style.css','/assets/pin-code-cafe-logo.jpg','/healthz','/api/health','/pinid/api/health']) {
      const response = await fetch(base+route); assert.equal(response.status,200,route); await response.arrayBuffer();
    }
    for (const route of ['/api/me','/pinid/api/me']) {
      const response=await fetch(base+route);assert.equal(response.status,401);await response.text();
    }
    const inv = app.locals.pinid.invite().invitation;
    const enrolled=await fetch(base+'/api/enroll',{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json'},
      body:JSON.stringify({invitation:inv,username:'standalone-owner',location:{latitude:12.972579,longitude:77.592015,confirmed:true}})});
    assert.equal(enrolled.status,201);const profile=await enrolled.json();assert.equal(profile.location.digipin,'4P3JK83M28');
    const cookie=enrolled.headers.get('set-cookie').split(';')[0];
    for (const route of ['/api/digipin/encode','/api/digipin/decode']) {
      const response=await fetch(base+route,{headers:{Cookie:cookie}});assert.equal(response.status,404,route);
      assert.equal((await response.json()).error.code,'NOT_FOUND');
    }
    const recovered=await fetch(base+'/pinid/api/me',{headers:{Cookie:cookie}});assert.equal(recovered.status,200);
    assert.equal((await recovered.json()).id,profile.id);
  } finally { await new Promise(resolve=>server.close(resolve));app.locals.pinid.close(); }
});
