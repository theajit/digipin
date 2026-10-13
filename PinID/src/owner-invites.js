'use strict';
const crypto=require('node:crypto');const s=require('./security');const {contact}=require('./invitation-contact');
module.exports={
 invitePerson(userId,input){const payload=contact(input);return this.repo.transaction(()=>{
  if(!this.repo.get("SELECT id FROM users WHERE id=? AND status='active'",userId))throw new s.LiteError('NOT_FOUND',404);
  if(this.repo.get('SELECT user_id FROM owner_invites WHERE user_id=?',userId))throw new s.LiteError('INVITE_LIMIT_REACHED',409);
  const id=crypto.randomUUID();this.repo.run('INSERT INTO interest_requests(id,encrypted,created_at) VALUES(?,?,?)',id,s.encrypt(this.config.encryptionKey,'interest-queue',id,payload),this.now());
  const issued=this.issueContact(id,userId);this.repo.run('INSERT INTO owner_invites(user_id,request_id,invitation_id,created_at) VALUES(?,?,?,?)',userId,id,issued.id,this.now());this.audit(userId,'owner.invitation.issued');return {used:true,status:'approved',...issued};
 });},
 issueContact(requestId,userId){const invitation=s.token(),id=crypto.randomUUID(),expires_at=this.now()+172800000;
  this.repo.run('INSERT INTO invitations VALUES(?,?,?,NULL)',id,s.hash(invitation),expires_at);this.repo.run('UPDATE interest_requests SET status=? WHERE id=?','approved',requestId);this.repo.run('INSERT INTO invitation_links(invitation_id,request_id,user_id) VALUES(?,?,?)',id,requestId,userId||null);return {id,invitation,expires_at};
 },
 replaceInvitation(userId){return this.repo.transaction(()=>{
  if(!this.repo.get("SELECT id FROM users WHERE id=? AND status='active'",userId))throw new s.LiteError('NOT_FOUND',404);
  const row=this.repo.get('SELECT owner_invites.request_id,owner_invites.invitation_id,invitations.consumed_at FROM owner_invites JOIN invitations ON invitations.id=owner_invites.invitation_id WHERE user_id=?',userId);
  if(!row?.request_id||row.consumed_at!=null)throw new s.LiteError('INVITATION_UNAVAILABLE',409);
  this.repo.run('UPDATE invitations SET expires_at=0 WHERE id=?',row.invitation_id);const issued=this.issueContact(row.request_id,userId);this.repo.run('UPDATE owner_invites SET invitation_id=? WHERE user_id=?',issued.id,userId);this.audit(userId,'owner.invitation.replaced');return issued;
 });},
 extraHandle(userId,input){s.fields(input,['name','phone','email','confirmed','username'],['name','phone','email','confirmed','username']);const {username,...details}=input,payload={...contact(details),alias:s.alias(username)};return this.repo.transaction(()=>{if(!this.repo.get("SELECT id FROM users WHERE id=? AND status='active'",userId))throw new s.LiteError('NOT_FOUND',404);const id=crypto.randomUUID();this.repo.run("INSERT INTO interest_requests(id,encrypted,created_at,kind,owner_user_id) VALUES(?,?,?,'extra_handle',?)",id,s.encrypt(this.config.encryptionKey,'interest-queue',id,payload),this.now(),userId);this.audit(userId,'handle.requested');return {id,status:'received'};});},
 requestContact(id){const row=this.repo.get('SELECT encrypted,kind,status FROM interest_requests WHERE id=?',id);if(!row)throw new s.LiteError('NOT_FOUND',404);return {...s.decrypt(this.config.encryptionKey,'interest-queue',id,row.encrypted),kind:row.kind,status:row.status};},
 adminContactInvite(input){const payload=contact(input);return this.repo.transaction(()=>{const id=crypto.randomUUID();this.repo.run('INSERT INTO interest_requests(id,encrypted,created_at) VALUES(?,?,?)',id,s.encrypt(this.config.encryptionKey,'interest-queue',id,payload),this.now());const issued=this.issueContact(id,null);this.audit(null,'administrator.invitation.issued');return issued;});},
 invitationStatus(userId){const row=this.repo.get('SELECT interest_requests.status,invitations.expires_at,invitations.consumed_at FROM owner_invites LEFT JOIN interest_requests ON interest_requests.id=owner_invites.request_id LEFT JOIN invitations ON invitations.id=owner_invites.invitation_id WHERE owner_invites.user_id=?',userId);
  return row?{used:true,status:row.consumed_at!=null?'redeemed':row.expires_at!=null&&Number(row.expires_at)<=this.now()?'expired':row.status||'removed'}:{used:false,status:'available'};
 },
 allInvitations(before){if(before!==undefined)s.fields(before,['time','id'],['time','id']);const cutoff=before?.time??Number.MAX_SAFE_INTEGER,last=before?.id??'ffffffff-ffff-ffff-ffff-ffffffffffff';if(!Number.isSafeInteger(cutoff)||cutoff<0||typeof last!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(last))throw new s.LiteError('INVALID_REQUEST');
  const rows=this.repo.all('SELECT invitations.id,invitations.expires_at,invitations.consumed_at,users.alias AS inviter,invitation_links.mail_status,interest_requests.id AS request_id,interest_requests.encrypted FROM invitations LEFT JOIN invitation_links ON invitation_links.invitation_id=invitations.id LEFT JOIN users ON users.id=invitation_links.user_id LEFT JOIN interest_requests ON interest_requests.id=invitation_links.request_id WHERE invitations.expires_at<? OR (invitations.expires_at=? AND invitations.id<?) ORDER BY invitations.expires_at DESC,invitations.id DESC LIMIT 50',cutoff,cutoff,last);
  return {items:rows.map(row=>({id:row.id,expires_at:Number(row.expires_at),status:row.consumed_at!=null?'redeemed':Number(row.expires_at)<=this.now()?'expired':'active',inviter:row.inviter||null,mail_status:row.mail_status||'not_sent',...(row.encrypted?s.decrypt(this.config.encryptionKey,'interest-queue',row.request_id,row.encrypted):{})})),next_cursor:rows.length===50?{time:Number(rows.at(-1).expires_at),id:rows.at(-1).id}:null};
 }
};
