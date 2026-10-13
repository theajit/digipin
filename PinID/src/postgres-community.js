'use strict';
const crypto=require('node:crypto');const s=require('./security');
module.exports={
 async interest(input){
  s.fields(input,['name','phone','email','username','confirmed'],['name','phone','email','username','confirmed']);
  if(input.confirmed!==true||typeof input.name!=='string'||input.name.trim().length<1||input.name.length>100||
    typeof input.email!=='string'||input.email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)||
    typeof input.phone!=='string'||(! /^[+0-9 ()-]{7,25}$/.test(input.phone)||input.phone.replace(/\D/g,'').length<7||input.phone.replace(/\D/g,'').length>15))throw new s.LiteError('INVALID_REQUEST');
  const payload={name:input.name.trim(),phone:input.phone.trim(),email:input.email.trim(),alias:s.alias(input.username)};
  const id=crypto.randomUUID();
  await this.repo.run('INSERT INTO interest_requests(id,encrypted,created_at) VALUES(?,?,?)',id,s.encrypt(this.config.encryptionKey,'interest-queue',id,payload),this.now());
  return {status:'received'};
 },
 adminHash(value){return this.sessionHash(`administrator:${this.config.adminSecret}:${value}`);},
 async adminLogin(input){
  s.fields(input,['credential'],['credential']);if(!s.same(input.credential,this.config.adminSecret))throw new s.LiteError('UNAUTHORIZED',401);
  const session=s.token();await this.repo.run('DELETE FROM admin_sessions WHERE expires_at<=?',this.now());
  await this.repo.run('INSERT INTO admin_sessions VALUES(?,?)',this.adminHash(session),this.now()+3600000);return session;
 },
 async adminCheck(session){if(!s.validToken(session)||!(await this.repo.get('SELECT token_hash FROM admin_sessions WHERE token_hash=? AND expires_at>?',this.adminHash(session),this.now())))throw new s.LiteError('UNAUTHORIZED',401);},
 async adminLogout(session){await this.repo.run('DELETE FROM admin_sessions WHERE token_hash=?',this.adminHash(session));},
 async queue(before){
  if(before!==undefined)s.fields(before,['time','id'],['time','id']);
  const cutoff=before?.time??Number.MAX_SAFE_INTEGER, last=before?.id??'ffffffff-ffff-ffff-ffff-ffffffffffff';if(!Number.isSafeInteger(cutoff)||cutoff<0||typeof last!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(last))throw new s.LiteError('INVALID_REQUEST');
  const rows=await this.repo.all('SELECT * FROM interest_requests WHERE created_at<? OR (created_at=? AND id<?) ORDER BY created_at DESC,id DESC LIMIT 50',cutoff,cutoff,last);
  return {items:rows.map(row=>({id:row.id,status:row.status,created_at:Number(row.created_at),...s.decrypt(this.config.encryptionKey,'interest-queue',row.id,row.encrypted)})),next_cursor:rows.length===50?{time:Number(rows.at(-1).created_at),id:rows.at(-1).id}:null};
 },
 async decide(id,input){
  s.fields(input,['decision'],['decision']);if(!['approve','reject'].includes(input.decision))throw new s.LiteError('INVALID_REQUEST');
  if(! /^[0-9a-f-]{36}$/i.test(id))throw new s.LiteError('NOT_FOUND',404);
  return this.repo.transaction(async()=>{
   const request=await this.repo.get('SELECT status FROM interest_requests WHERE id=? FOR UPDATE',id);
   if(!request||request.status!=='pending')throw new s.LiteError('NOT_FOUND',404);
   const changed=await this.repo.run('UPDATE interest_requests SET status=? WHERE id=? AND status=?',input.decision==='approve'?'approved':'rejected',id,'pending');
   if(changed.changes!==1)throw new s.LiteError('NOT_FOUND',404);
   let result=null;if(input.decision==='approve'){
    const invitation=s.token(),expires=this.now()+172800000;
    await this.repo.run('INSERT INTO invitations VALUES(?,?,?,NULL)',crypto.randomUUID(),s.hash(invitation),expires);
    result={invitation,expires_at:expires};
   }
   await this.audit(null,`interest.${input.decision}`);return result;
  });
 },
 async removeRequest(id){if(! /^[0-9a-f-]{36}$/i.test(id))throw new s.LiteError('NOT_FOUND',404);await this.repo.run('DELETE FROM interest_requests WHERE id=?',id);},
 async sharing(userId,input){
  s.fields(input,['enabled','confirmed'],['enabled']);if(typeof input.enabled!=='boolean'||(input.enabled&&input.confirmed!==true))throw new s.LiteError('CONFIRMATION_REQUIRED');
  return this.repo.transaction(async()=>{
   const user=await this.repo.get("SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE",userId);if(!user)throw new s.LiteError('NOT_FOUND',404);
   if((await this.repo.run('UPDATE locations SET public_enabled=? WHERE user_id=?',input.enabled?1:0,userId)).changes!==1)throw new s.LiteError('NOT_FOUND',404);
   await this.audit(userId,input.enabled?'sharing.enabled':'sharing.revoked');return {enabled:input.enabled};
  });
 },
 async sharingStatus(userId){const row=await this.repo.get('SELECT public_enabled FROM locations WHERE user_id=?',userId);return {enabled:row?.public_enabled===1};},
 async resolve(input){
  s.fields(input,['handle'],['handle']);if(typeof input.handle!=='string'||!input.handle.trim().toLowerCase().endsWith('@pincode'))throw new s.LiteError('NOT_FOUND',404);
  let alias;try{alias=s.alias(input.handle.trim().slice(0,-8));}catch{throw new s.LiteError('NOT_FOUND',404);}
  const row=await this.repo.get("SELECT locations.id,locations.user_id,locations.encrypted FROM locations JOIN users ON users.id=locations.user_id WHERE users.alias=? AND users.status='active' AND locations.public_enabled=1",alias);
  if(!row)throw new s.LiteError('NOT_FOUND',404);const value=s.decrypt(this.config.encryptionKey,row.user_id,row.id,row.encrypted);
  return {handle:alias,digipin:value.digipin,latitude:value.latitude,longitude:value.longitude};
 }
};
