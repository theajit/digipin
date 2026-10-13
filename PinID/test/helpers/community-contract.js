'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {once}=require('node:events');
const {Service}=require('../../src/service');const {createApp}=require('../../src/app');const s=require('../../src/security');
const loc={latitude:12.972579,longitude:77.592015,confirmed:true,address:'PRIVATE NOTES',label:'Private home'};
async function contract(t,service,config){
 const app=createApp(config,service),server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 const request=(route,method='GET',body,cookie,csrf,origin=config.origin)=>fetch(base+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-PinID-CSRF':csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 try {
  const owner=await service.enroll({invitation:(await service.invite()).invitation,username:'community-owner',location:loc});
  const cookie=`__Host-pinid_lite=${owner.session}`,csrf=service.csrf(owner.session);
  await t.test('encrypted interest queue is administrator-only with CSRF, single approval and logout',async()=>{
   const details={name:'Synthetic applicant',phone:'+91 9990000000',email:'synthetic@example.test',username:'requested-name',confirmed:true};
   assert.equal((await request('/api/interest','POST',details)).status,202);
   const stored=await service.repo.get('SELECT encrypted FROM interest_requests');assert.ok(!stored.encrypted.includes(details.email));assert.ok(!stored.encrypted.includes(details.name));
   assert.equal((await request('/api/admin/queue','POST',{},cookie,csrf)).status,401);
   assert.equal((await request('/api/admin/login','POST',{credential:owner.recovery_credential})).status,401);
   const login=await request('/api/admin/login','POST',{credential:config.adminSecret});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.match(login.headers.get('set-cookie'),/Secure/);
   const adminCookie=login.headers.get('set-cookie').split(';')[0],adminCsrf=(await login.json()).csrf;
   assert.equal((await request('/api/admin/queue','POST',{},adminCookie)).status,403);
   const page=await (await request('/api/admin/queue','POST',{},adminCookie,adminCsrf)).json();assert.equal(page.items.length,1);assert.equal(page.items[0].alias,'requested-name@pincode');
   const approved=await request('/api/admin/requests/'+page.items[0].id,'POST',{decision:'approve'},adminCookie,adminCsrf);assert.equal(approved.status,200);const invite=await approved.json();assert.ok(invite.invitation);
   assert.equal((await request('/api/admin/requests/'+page.items[0].id,'POST',{decision:'approve'},adminCookie,adminCsrf)).status,404);
   assert.ok((await service.enroll({invitation:invite.invitation,username:'requested-name',location:loc})).session);
   await assert.rejects(async()=>service.enroll({invitation:invite.invitation,username:'another-name',location:loc}));
   assert.equal((await request('/api/admin/requests/'+page.items[0].id,'DELETE',{},adminCookie,adminCsrf)).status,204);assert.equal((await service.queue()).items.length,0);
   assert.equal((await request('/api/admin/logout','POST',{},adminCookie,adminCsrf)).status,204);assert.equal((await request('/api/admin/me','GET',undefined,adminCookie)).status,401);
   const expiring=await request('/api/admin/login','POST',{credential:config.adminSecret});const expiredCookie=expiring.headers.get('set-cookie').split(';')[0];await service.repo.run('UPDATE admin_sessions SET expires_at=0');assert.equal((await request('/api/admin/me','GET',undefined,expiredCookie)).status,401);
  });
  await t.test('sharing is explicit owner-only narrow revocable and resets on update/delete',async()=>{
   const handle={handle:'community-owner@pincode'};
   assert.equal((await request('/api/resolve','POST',handle)).status,404);
   assert.equal((await request('/api/sharing','PUT',{enabled:true},cookie,csrf)).status,400);
   assert.equal((await request('/api/sharing','PUT',{enabled:true,confirmed:true})).status,401);
   assert.equal((await request('/api/sharing','PUT',{enabled:true,confirmed:true},cookie)).status,403);
   assert.equal((await request('/api/sharing','PUT',{enabled:true,confirmed:true,user_id:'another'},cookie,csrf)).status,400);
   assert.equal((await request('/api/sharing','PUT',{enabled:true,confirmed:true},cookie,csrf)).status,200);
   const resolved=await request('/api/resolve','POST',handle);assert.equal(resolved.status,200);assert.equal(resolved.headers.get('cache-control'),'no-store');assert.deepEqual(Object.keys(await resolved.json()).sort(),['digipin','handle','latitude','longitude']);
   const cors=await request('/api/resolve','POST',handle,undefined,undefined,'https://digipin.pincode.cafe');assert.equal(cors.status,200);assert.equal(cors.headers.get('access-control-allow-origin'),'https://digipin.pincode.cafe');
   assert.equal((await request('/api/resolve','POST',handle,undefined,undefined,'https://evil.test')).status,403);
   assert.equal((await request('/api/me','GET',undefined,undefined,undefined,'https://digipin.pincode.cafe')).headers.get('access-control-allow-origin'),null);
   await service.sharing(owner.profile.id,{enabled:false});assert.equal((await request('/api/resolve','POST',handle)).status,404);
   await service.sharing(owner.profile.id,{enabled:true,confirmed:true});await service.saveLocation(owner.profile.id,loc);await assert.rejects(async()=>service.resolve(handle),{code:'NOT_FOUND'});
   await service.sharing(owner.profile.id,{enabled:true,confirmed:true});await service.deleteLocation(owner.profile.id,owner.profile.location.id);await assert.rejects(async()=>service.resolve(handle),{code:'NOT_FOUND'});
  });
  await t.test('stable queue pagination retains equal-timestamp requests and rejects oversized fields',async()=>{
   for(let i=0;i<52;i++)await service.interest({name:'Synthetic',phone:'+91 9990000000',email:'synthetic@example.test',username:'queue-user',confirmed:true});
   const first=await service.queue(),second=await service.queue(first.next_cursor);assert.equal(first.items.length,50);assert.equal(second.items.length,2);assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,52);
   await assert.rejects(async()=>service.interest({name:'x'.repeat(101),phone:'+91 9990000000',email:'synthetic@example.test',username:'queue-user',confirmed:true}));
  });
  await t.test('approval rollback retains pending request and sharing persists across reopening',async()=>{
   const pending=(await service.queue()).items[0],before=await service.repo.get('SELECT count(*) AS n FROM invitations'),audit=service.audit;
   service.audit=()=>{throw new Error('Injected audit failure');};try{await assert.rejects(async()=>service.decide(pending.id,{decision:'approve'}));}finally{service.audit=audit;}
   assert.equal((await service.repo.get('SELECT status FROM interest_requests WHERE id=?',pending.id)).status,'pending');assert.equal((await service.repo.get('SELECT count(*) AS n FROM invitations')).n,before.n);
   await service.saveLocation(owner.profile.id,loc);await service.sharing(owner.profile.id,{enabled:true,confirmed:true});
   const Other=service.constructor,other= config.backend==='postgres'?await Other.create(config):null;
   if(other){try{assert.equal((await other.resolve({handle:'community-owner@pincode'})).digipin,'4P3JK83M28');}finally{await other.close();}}
   await service.sharing(owner.profile.id,{enabled:false});
  });
 }finally{await new Promise(resolve=>server.close(resolve));}
}
module.exports={contract};
