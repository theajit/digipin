'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {once}=require('node:events');
const {Service}=require('../src/service');const {createApp}=require('../src/app');const s=require('../src/security');
const loc={latitude:12.972579,longitude:77.592015,confirmed:true,address:'PRIVATE NOTES',label:'Private home'};
const {contract}=require('./helpers/community-contract');
test('SQLite administrator queue and public sharing contract',async t=>{
 const root=path.join(__dirname,'../test-data/runs');fs.mkdirSync(root,{recursive:true});const config={directory:fs.mkdtempSync(path.join(root,'community-')),encryptionKey:Buffer.from(s.token(),'base64url'),sessionSecret:s.token(),adminSecret:s.token(),origin:'https://pinid.test',secure:true,sessionSeconds:3600};
 const service=new Service(config,()=>1700000000000);try{await contract(t,service,config);}finally{service.close();}
});
module.exports={contract};
test('additive SQLite v1 upgrade preserves encrypted location and defaults sharing off',()=>{
 const {DatabaseSync}=require('node:sqlite');const root=path.join(__dirname,'../test-data/runs');fs.mkdirSync(root,{recursive:true});const directory=fs.mkdtempSync(path.join(root,'community-upgrade-'));
 const config={directory,encryptionKey:Buffer.from(s.token(),'base64url'),sessionSecret:s.token(),adminSecret:s.token(),origin:'https://pinid.test',secure:true,sessionSeconds:3600};
 const user=require('node:crypto').randomUUID(),location=require('node:crypto').randomUUID(),encrypted=s.encrypt(config.encryptionKey,user,location,s.location(loc));
 const db=new DatabaseSync(path.join(directory,'pinid.sqlite'));const sql=fs.readFileSync(path.join(__dirname,'../migrations/001.sql'),'utf8').replace(/\r\n/g,'\n');db.exec(sql);db.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL) STRICT');db.prepare('INSERT INTO schema_migrations VALUES(1,?)').run(s.hash(sql));db.prepare('INSERT INTO users VALUES(?,?,?, ?,?)').run(user,'old-user@pincode',s.hash(s.token()),'active',1700000000000);db.prepare('INSERT INTO locations VALUES(?,?,?,?)').run(location,user,encrypted,1700000000000);db.close();
 let service=new Service(config);assert.equal(service.profile(user).location.digipin,'4P3JK83M28');assert.equal(service.repo.get('SELECT encrypted FROM locations').encrypted,encrypted);assert.equal(service.sharingStatus(user).enabled,false);service.sharing(user,{enabled:true,confirmed:true});service.close();service=new Service(config);assert.equal(service.resolve({handle:'old-user@pincode'}).digipin,'4P3JK83M28');service.close();
});
