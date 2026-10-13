'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const {once}=require('node:events');
const {coordinates}=require('../src/coordinates');
test('DIGIPIN lookup normalizes official characters and returns grid centre only',()=>{
 const value=coordinates({digipin:'4p3-jk8-3m28'});assert.equal(value.digipin,'4P3JK83M28');
 assert.ok(Math.abs(value.latitude-12.972579)<0.0001);assert.ok(Math.abs(value.longitude-77.592015)<0.0001);
 assert.deepEqual(Object.keys(value),['digipin','latitude','longitude','precision']);assert.equal(value.precision,'grid-centre');
 for(const digipin of ['',null,123,'4P3JK83M2','4P3JK83M2A','4P3JK83M28'.repeat(4)])assert.throws(()=>coordinates({digipin}));
 assert.throws(()=>coordinates({digipin:'4P3JK83M28',owner:'other'}));
});
test('anonymous decode is origin protected, private records stay inaccessible',async t=>{
 const {token}=require('../src/security');const {createApp}=require('../src/app');
 const root=path.resolve(__dirname,'../test-data/runs');fs.mkdirSync(root,{recursive:true});
 const config={directory:fs.mkdtempSync(path.join(root,'decode-')),encryptionKey:Buffer.from(token(),'base64url'),sessionSecret:token(),adminSecret:token(),origin:'https://pinid.test',secure:true,sessionSeconds:3600};
 const app=createApp(config);const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{await new Promise(resolve=>server.close(resolve));app.locals.pinid.close();});
 const base=`http://127.0.0.1:${server.address().port}`;
 const request=(origin,body,type='application/json')=>fetch(base+'/api/tools/decode',{method:'POST',headers:{Origin:origin,'Content-Type':type},body:JSON.stringify(body)});
 const good=await request(config.origin,{digipin:'4P3 JK83 M28'});assert.equal(good.status,200);assert.equal((await good.json()).digipin,'4P3JK83M28');assert.equal(good.headers.get('cache-control'),'no-store');
 assert.equal((await request('https://attacker.test',{digipin:'4P3JK83M28'})).status,403);
 assert.equal((await request(config.origin,{digipin:'4P3JK83M28'},'text/plain')).status,415);
 assert.equal((await request(config.origin,{digipin:'invalid'})).status,400);
 assert.equal((await fetch(base+'/api/me')).status,401);
 const page=await (await fetch(base+'/')).text();assert.ok(!page.includes('href="/admin.html"'));assert.ok(page.includes('Find this DIGIPIN'));
 for(let attempt=0;attempt<8;attempt++)assert.equal((await request(config.origin,{digipin:'4P3JK83M28'})).status,200);
 assert.equal((await request(config.origin,{digipin:'4P3JK83M28'})).status,429);
});
