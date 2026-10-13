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
   await service.repo.run('UPDATE locations SET public_enabled=1 WHERE user_id=?',owner.profile.id);
   assert.equal((await request('/api/resolve','POST',handle)).status,404);assert.equal((await service.sharingStatus(owner.profile.id)).enabled,false);
   await service.repo.run('UPDATE locations SET public_enabled=0 WHERE user_id=?',owner.profile.id);
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
   const approvals=await Promise.allSettled([Promise.resolve().then(()=>service.decide(pending.id,{decision:'approve'})),Promise.resolve().then(()=>service.decide(pending.id,{decision:'approve'}))]);assert.equal(approvals.filter(x=>x.status==='fulfilled').length,1);assert.equal(Number((await service.repo.get('SELECT count(*) AS n FROM invitations')).n),Number(before.n)+1);
   await service.saveLocation(owner.profile.id,loc);await service.sharing(owner.profile.id,{enabled:true,confirmed:true});
   const Other=service.constructor,other= config.backend==='postgres'?await Other.create(config):null;
   if(other){try{assert.equal((await other.resolve({handle:'community-owner@pincode'})).digipin,'4P3JK83M28');}finally{await other.close();}}
   await service.sharing(owner.profile.id,{enabled:false});
  });
  await t.test('one lifetime owner invitation is immediate, transactional, encrypted and administrator visible',async()=>{
   async function referral(alias){let before;do{const page=await service.queue(before);const found=page.items.find(x=>x.inviter===alias);if(found)return found;before=page.next_cursor;}while(before);}
   const who=await service.enroll({invitation:(await service.invite()).invitation,username:'referral-owner',location:loc});const other=await service.enroll({invitation:(await service.invite()).invitation,username:'referral-other',location:loc});
   const details={name:'Referral recipient',phone:'+91 9000000001',email:'recipient@example.test',confirmed:true};const wc=`__Host-pinid_lite=${who.session}`,wcsrf=service.csrf(who.session);
   for(const invalid of [{...details,confirmed:false},{...details,email:'invalid'},{...details,phone:'abc'},{...details,name:''}])await assert.rejects(async()=>service.invitePerson(who.profile.id,invalid));
   assert.equal((await request('/api/my-invitation','GET')).status,401);assert.equal((await request('/api/my-invitation','POST',details,wc)).status,403);
   assert.equal((await request('/api/my-invitation','POST',{...details,user_id:other.profile.id},wc,wcsrf)).status,400);
   const audit=service.audit;service.audit=()=>{throw new Error('Synthetic audit failure');};try{await assert.rejects(async()=>service.invitePerson(who.profile.id,details));}finally{service.audit=audit;}
   assert.equal((await service.invitationStatus(who.profile.id)).used,false);
   const races=await Promise.allSettled([Promise.resolve().then(()=>service.invitePerson(who.profile.id,details)),Promise.resolve().then(()=>service.invitePerson(who.profile.id,details))]);assert.equal(races.filter(x=>x.status==='fulfilled').length,1);assert.equal(races.find(x=>x.status==='rejected').reason.code,'INVITE_LIMIT_REACHED');
   assert.deepEqual(await service.invitationStatus(who.profile.id),{used:true,status:'approved'});assert.equal((await service.invitationStatus(other.profile.id)).used,false);
   const pending=await referral('referral-owner@pincode');assert.equal(pending.email,details.email);const stored=await service.repo.get('SELECT encrypted FROM interest_requests WHERE id=?',pending.id);assert.ok(!stored.encrypted.includes(details.email));
   const login=await request('/api/admin/login','POST',{credential:config.adminSecret});const ac=login.headers.get('set-cookie').split(';')[0],acsrf=(await login.json()).csrf;
   assert.equal((await request('/api/admin/invitations/list','POST',{},wc,wcsrf)).status,401);assert.equal((await request('/api/admin/invitations/list','POST',{},ac)).status,403);
   const code=races.find(x=>x.status==='fulfilled').value;assert.ok(code.invitation);assert.equal((await request('/api/admin/requests/'+pending.id,'POST',{decision:'approve'},ac,acsrf)).status,404);
   const list=await (await request('/api/admin/invitations/list','POST',{},ac,acsrf)).json();const entry=list.items.find(x=>x.inviter==='referral-owner@pincode');assert.equal(entry.email,details.email);assert.equal(entry.status,'active');assert.ok(!JSON.stringify(list).includes(code.invitation));assert.ok(!JSON.stringify(list).includes('token_hash'));
   const invitation=await service.repo.get('SELECT invitation_id FROM owner_invites WHERE user_id=?',who.profile.id);await service.repo.run('UPDATE invitations SET expires_at=0 WHERE id=?',invitation.invitation_id);assert.equal((await service.invitationStatus(who.profile.id)).status,'expired');await assert.rejects(async()=>service.invitePerson(who.profile.id,details),{code:'INVITE_LIMIT_REACHED'});
   const replacement=await service.replaceInvitation(who.profile.id);await assert.rejects(async()=>service.enroll({invitation:code.invitation,username:'referral-recipient',location:loc}));await service.enroll({invitation:replacement.invitation,username:'referral-recipient',location:loc});assert.equal((await service.invitationStatus(who.profile.id)).status,'redeemed');await assert.rejects(async()=>service.replaceInvitation(who.profile.id),{code:'INVITATION_UNAVAILABLE'});
   await service.invitePerson(other.profile.id,details);const op=await referral('referral-other@pincode');await service.removeRequest(op.id);assert.deepEqual(await service.invitationStatus(other.profile.id),{used:true,status:'removed'});await assert.rejects(async()=>service.invitePerson(other.profile.id,details),{code:'INVITE_LIMIT_REACHED'});
   await service.deleteUser(who.profile.id,who.recovery_credential);assert.equal(await service.repo.get('SELECT id FROM interest_requests WHERE id=?',pending.id),undefined);assert.ok(await service.repo.get('SELECT user_id FROM owner_invites WHERE user_id=?',who.profile.id));
   const deleted=await service.repo.get('SELECT request_id FROM owner_invites WHERE user_id=?',who.profile.id);assert.equal(deleted.request_id,null);
  });
  await t.test('Resend owner delivery and extra-handle notification use private fixed destinations and safe failures',async()=>{
   const messages=[];config.mail={key:`re_${s.token()}`,from:'sender@example.test',fetch:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,`Bearer ${config.mail.key}`);assert.match(options.headers['Idempotency-Key'],/^pinid\//);messages.push(JSON.parse(options.body));return {ok:true,json:async()=>({id:'synthetic-accepted-id'})};}};
   try{const who=await service.enroll({invitation:(await service.invite()).invitation,username:'mail-owner',location:loc});const wc=`__Host-pinid_lite=${who.session}`,wcsrf=service.csrf(who.session),details={name:'Synthetic mail recipient',phone:'+91 9000000001',email:'recipient@example.test',confirmed:true};
    const response=await request('/api/my-invitation','POST',details,wc,wcsrf);assert.equal(response.status,202);const value=await response.json();assert.equal(value.delivery,'accepted');assert.ok(!value.invitation);assert.equal(messages.length,2);assert.deepEqual(messages[0].to,[details.email]);assert.ok(!messages[0].cc);assert.deepEqual(messages[1].to,['invite@pincode.cafe']);assert.deepEqual(messages[1].cc,['ajit@pincode.cafe']);for(const msg of messages){assert.ok(!msg.text.includes(loc.address));assert.ok(!msg.text.includes(String(loc.latitude)));}
    assert.equal((await request('/api/my-invitation','POST',details,wc,wcsrf)).status,409);
    const handle=await request('/api/handle-requests','POST',{...details,username:'extra-mail'},wc,wcsrf);assert.equal(handle.status,202);assert.equal((await handle.json()).notification,'accepted');assert.match(messages.at(-1).subject,/199/);const requestId=(await service.repo.get("SELECT id FROM interest_requests WHERE owner_user_id=? AND kind='extra_handle'",who.profile.id)).id;await assert.rejects(async()=>service.decide(requestId,{decision:'approve'}),{code:'HANDLE_FULFILLMENT_UNAVAILABLE'});assert.equal((await service.profile(who.profile.id)).alias,'mail-owner@pincode');
    const exported=await (await request('/api/me/export','GET',undefined,wc)).json();assert.equal(exported.requests.length,2);assert.ok(exported.requests.every(row=>row.email===details.email));assert.ok(!JSON.stringify(exported).includes('token_hash'));const other=await service.enroll({invitation:(await service.invite()).invitation,username:'mail-export-other',location:loc});assert.equal((await service.exportData(other.profile.id)).requests.length,0);
    config.mail.fetch=async()=>{throw new Error(`Secret ${config.mail.key} ${loc.latitude}`);};const retry=await request('/api/my-invitation/resend','POST',{},wc,wcsrf);assert.equal(retry.status,200);assert.deepEqual(await retry.json(),{used:true,delivery:'failed'});assert.equal((await service.invitationStatus(who.profile.id)).used,true);await service.deleteUser(who.profile.id,who.recovery_credential);assert.equal(await service.repo.get('SELECT id FROM interest_requests WHERE id=?',requestId),undefined);
   }finally{delete config.mail;}
  });
 }finally{await new Promise(resolve=>server.close(resolve));}
}
module.exports={contract};
