'use strict';
const crypto=require('node:crypto');const s=require('./security');
module.exports={
 interest(input){
  s.fields(input,['name','phone','email','username','confirmed'],['name','phone','email','username','confirmed']);
  if(input.confirmed!==true||typeof input.name!=='string'||input.name.trim().length<1||input.name.length>100||
    typeof input.email!=='string'||input.email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)||
    typeof input.phone!=='string'||(! /^[+0-9 ()-]{7,25}$/.test(input.phone)||input.phone.replace(/\D/g,'').length<7||input.phone.replace(/\D/g,'').length>15))throw new s.LiteError('INVALID_REQUEST');
  const payload={name:input.name.trim(),phone:input.phone.trim(),email:input.email.trim(),alias:s.alias(input.username)};
  const id=crypto.randomUUID();
  this.repo.run('INSERT INTO interest_requests(id,encrypted,created_at) VALUES(?,?,?)',id,s.encrypt(this.config.encryptionKey,'interest-queue',id,payload),this.now());
  return {status:'received'};
 },
 adminHash(value){return this.sessionHash(`administrator:${this.config.adminSecret}:${value}`);},
 adminLogin(input){
  s.fields(input,['credential'],['credential']);if(!s.same(input.credential,this.config.adminSecret))throw new s.LiteError('UNAUTHORIZED',401);
  const session=s.token();this.repo.run('DELETE FROM admin_sessions WHERE expires_at<=?',this.now());
  this.repo.run('INSERT INTO admin_sessions VALUES(?,?)',this.adminHash(session),this.now()+3600000);return session;
 },
 adminCheck(session){if(!s.validToken(session)||!this.repo.get('SELECT token_hash FROM admin_sessions WHERE token_hash=? AND expires_at>?',this.adminHash(session),this.now()))throw new s.LiteError('UNAUTHORIZED',401);},
 adminLogout(session){this.repo.run('DELETE FROM admin_sessions WHERE token_hash=?',this.adminHash(session));},
 queue(before){
  if(before!==undefined)s.fields(before,['time','id'],['time','id']);
  const cutoff=before?.time??Number.MAX_SAFE_INTEGER, last=before?.id??'ffffffff-ffff-ffff-ffff-ffffffffffff';if(!Number.isSafeInteger(cutoff)||cutoff<0||typeof last!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(last))throw new s.LiteError('INVALID_REQUEST');
  const rows=this.repo.all('SELECT * FROM interest_requests WHERE created_at<? OR (created_at=? AND id<?) ORDER BY created_at DESC,id DESC LIMIT 50',cutoff,cutoff,last);
  return {items:rows.map(row=>({id:row.id,status:row.status,created_at:Number(row.created_at),...s.decrypt(this.config.encryptionKey,'interest-queue',row.id,row.encrypted)})),next_cursor:rows.length===50?{time:Number(rows.at(-1).created_at),id:rows.at(-1).id}:null};
 },
 decide(id,input){
  s.fields(input,['decision'],['decision']);if(!['approve','reject'].includes(input.decision))throw new s.LiteError('INVALID_REQUEST');
  if(! /^[0-9a-f-]{36}$/i.test(id))throw new s.LiteError('NOT_FOUND',404);
  return this.repo.transaction(()=>{
   const request=this.repo.get('SELECT status FROM interest_requests WHERE id=?',id);
   if(!request||request.status!=='pending')throw new s.LiteError('NOT_FOUND',404);
   const changed=this.repo.run('UPDATE interest_requests SET status=? WHERE id=? AND status=?',input.decision==='approve'?'approved':'rejected',id,'pending');
   if(changed.changes!==1)throw new s.LiteError('NOT_FOUND',404);
   let result=null;if(input.decision==='approve'){
    const invitation=s.token(),expires=this.now()+172800000;
    this.repo.run('INSERT INTO invitations VALUES(?,?,?,NULL)',crypto.randomUUID(),s.hash(invitation),expires);
    result={invitation,expires_at:expires};
   }
   this.audit(null,`interest.${input.decision}`);return result;
  });
 },
 removeRequest(id){if(! /^[0-9a-f-]{36}$/i.test(id))throw new s.LiteError('NOT_FOUND',404);this.repo.run('DELETE FROM interest_requests WHERE id=?',id);},
 sharing(userId,input){
  s.fields(input,['enabled','confirmed'],['enabled']);if(typeof input.enabled!=='boolean'||(input.enabled&&input.confirmed!==true))throw new s.LiteError('CONFIRMATION_REQUIRED');
  return this.repo.transaction(()=>{
   const user=this.repo.get("SELECT id FROM users WHERE id=? AND status='active'",userId);if(!user)throw new s.LiteError('NOT_FOUND',404);
   const row=this.repo.get('SELECT id,encrypted FROM locations WHERE user_id=?',userId);if(!row)throw new s.LiteError('NOT_FOUND',404);
   const payload=s.decrypt(this.config.encryptionKey,userId,row.id,row.encrypted);payload.public_sharing=input.enabled;
   if(this.repo.run('UPDATE locations SET public_enabled=?,encrypted=? WHERE user_id=?',input.enabled?1:0,s.encrypt(this.config.encryptionKey,userId,row.id,payload),userId).changes!==1)throw new s.LiteError('NOT_FOUND',404);
   this.audit(userId,input.enabled?'sharing.enabled':'sharing.revoked');return {enabled:input.enabled};
  });
 },
 sharingStatus(userId){const row=this.repo.get('SELECT id,encrypted,public_enabled FROM locations WHERE user_id=?',userId);return {enabled:row?.public_enabled===1&&s.decrypt(this.config.encryptionKey,userId,row.id,row.encrypted).public_sharing===true};},
 resolve(input){
  s.fields(input,['handle'],['handle']);if(typeof input.handle!=='string'||!input.handle.trim().toLowerCase().endsWith('@pincode'))throw new s.LiteError('NOT_FOUND',404);
  let alias;try{alias=s.alias(input.handle.trim().slice(0,-8));}catch{throw new s.LiteError('NOT_FOUND',404);}
  const row=this.repo.get("SELECT locations.id,locations.user_id,locations.encrypted FROM locations JOIN users ON users.id=locations.user_id WHERE users.alias=? AND users.status='active' AND locations.public_enabled=1",alias);
  if(!row)throw new s.LiteError('NOT_FOUND',404);const value=s.decrypt(this.config.encryptionKey,row.user_id,row.id,row.encrypted);
  if(value.public_sharing!==true)throw new s.LiteError('NOT_FOUND',404);
  return {handle:alias,digipin:value.digipin,latitude:value.latitude,longitude:value.longitude};
 }
};
