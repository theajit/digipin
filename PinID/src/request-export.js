'use strict';
const s=require('./security');
module.exports={async exportData(userId){const profile=await this.profile(userId);const rows=await this.repo.all('SELECT id,encrypted,created_at,kind,status FROM interest_requests WHERE owner_user_id=? OR id IN (SELECT request_id FROM owner_invites WHERE user_id=?)',userId,userId);return {...profile,requests:rows.map(row=>({id:row.id,created_at:Number(row.created_at),kind:row.kind,status:row.status,...s.decrypt(this.config.encryptionKey,'interest-queue',row.id,row.encrypted)}))};}};
