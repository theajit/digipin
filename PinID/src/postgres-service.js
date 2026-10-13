'use strict';
const crypto = require('node:crypto');
const { PostgresRepository } = require('./postgres-repository');
const s = require('./security');
class Service {
  static async create(config, now = Date.now) {
    const service = new Service(); service.config=config;service.now=now;service.repo=new PostgresRepository(config.postgres);
    try {
      await service.repo.verify();
      await service.repo.transaction(async()=>{
        await service.repo.query('SELECT pg_advisory_xact_lock(74120602)');
        const check=await service.repo.get("SELECT value FROM settings WHERE name='key-check'");
        if(check){try{if(s.decrypt(config.encryptionKey,'configuration','key-check',check.value).check!=='pinid-lite-v1')throw new Error('Invalid key');}
          catch{throw new Error('PinID Lite encryption key does not match database');}}
        else await service.repo.run("INSERT INTO settings VALUES('key-check',?)",s.encrypt(config.encryptionKey,'configuration','key-check',{check:'pinid-lite-v1'}));
      });
      return service;
    } catch(error){await service.close();throw error;}
  }
  async audit(userId, action) {
    await this.repo.run('INSERT INTO audit_events VALUES(?,?,?,?)', crypto.randomUUID(), userId, action, this.now());
  }
  sessionHash(value) { return crypto.createHmac('sha256', this.config.sessionSecret).update(value).digest('hex'); }
  csrf(value) { return crypto.createHmac('sha256', this.config.sessionSecret).update(`csrf:${value}`).digest('base64url'); }
  async rate(ip, action) {
    await this.repo.run('DELETE FROM rate_limits WHERE expires_at<=?',this.now());
    const key = this.sessionHash(`rate:${ip}:${action}`);
    await this.repo.rate(this.sessionHash(`global:${action}`), action === 'owner' ? 300 : 60, 600, this.now());
    await this.repo.rate(key, action === 'owner' ? 120 : 10, 600, this.now());
  }
  async invite(seconds = 172800) {
    if (!Number.isInteger(seconds) || seconds < 60 || seconds > 604800) throw new s.LiteError('INVALID_REQUEST');
    const invitation = s.token(); const expiresAt = this.now() + seconds * 1000;
    await this.repo.transaction(async () => {
      await this.repo.run('INSERT INTO invitations VALUES(?,?,?,NULL)', crypto.randomUUID(), s.hash(invitation), expiresAt);
      await this.audit(null, 'invitation.created');
    });
    return { invitation, expires_at: expiresAt };
  }
  async createSession(userId) {
    const active=await this.repo.get("SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE",userId);
    if(!active)throw new s.LiteError('RECOVERY_FAILED',401);
    const session = s.token();
    await this.repo.run('DELETE FROM sessions WHERE expires_at<=?', this.now());
    // A fresh recovery login revokes prior sessions, reducing stolen-cookie exposure.
    await this.repo.run('DELETE FROM sessions WHERE user_id=?', userId);
    await this.repo.run('INSERT INTO sessions VALUES(?,?,?)', this.sessionHash(session), userId, this.now() + this.config.sessionSeconds * 1000);
    return session;
  }
  async enroll(input) {
    s.fields(input, ['invitation', 'username', 'location'], ['invitation', 'username', 'location']);
    if (!s.validToken(input.invitation)) throw new s.LiteError('ENROLLMENT_FAILED', 400);
    const name = s.alias(input.username); const payload = s.location(input.location);
    const userId = crypto.randomUUID(); const locationId = crypto.randomUUID(); const recovery = s.token();
    try {
      return await this.repo.transaction(async () => {
        const invite = await this.repo.get('SELECT id,expires_at FROM invitations WHERE token_hash=? AND consumed_at IS NULL AND expires_at>? FOR UPDATE', s.hash(input.invitation), this.now());
        if (!invite || invite.expires_at <= this.now()) throw new s.LiteError('ENROLLMENT_FAILED');
        await this.repo.run('INSERT INTO users VALUES(?,?,?,\'active\',?)', userId, name, s.hash(recovery), this.now());
        await this.repo.run('INSERT INTO locations(id,user_id,encrypted,updated_at) VALUES(?,?,?,?)', locationId, userId, s.encrypt(this.config.encryptionKey, userId, locationId, payload), this.now());
        const consumed = await this.repo.run('UPDATE invitations SET consumed_at=? WHERE id=? AND consumed_at IS NULL', this.now(), invite.id);
        if (consumed.changes !== 1) throw new s.LiteError('ENROLLMENT_FAILED');
        const session = await this.createSession(userId); await this.audit(userId, 'identity.enrolled');
        return { session, recovery_credential: recovery, profile: await this.profile(userId) };
      });
    } catch (error) {
      if (error instanceof s.LiteError) throw error;
      if (error.code === '23505') throw new s.LiteError('ENROLLMENT_FAILED');
      throw error;
    }
  }
  async recover(value) {
    // Hash a dummy for malformed credentials and return the same external failure.
    const hash = s.hash(s.validToken(value) ? value : 'invalid-credential');
    const user = await this.repo.get("SELECT id FROM users WHERE recovery_hash=? AND status='active'", hash);
    if (!user || !s.validToken(value)) throw new s.LiteError('RECOVERY_FAILED', 401);
    return this.repo.transaction(async () => { const session = await this.createSession(user.id); await this.audit(user.id, 'session.recovered'); return { session, profile: await this.profile(user.id) }; });
  }
  async owner(session) {
    if (!s.validToken(session)) throw new s.LiteError('UNAUTHORIZED', 401);
    const user = await this.repo.get("SELECT users.id FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>? AND users.status='active'", this.sessionHash(session), this.now());
    if (!user) throw new s.LiteError('UNAUTHORIZED', 401);
    return user.id;
  }
  async profile(userId) {
    const user = await this.repo.get("SELECT id,alias,created_at FROM users WHERE id=? AND status='active'", userId);
    if (!user) throw new s.LiteError('NOT_FOUND', 404);
    const record = await this.repo.get('SELECT * FROM locations WHERE user_id=?', userId);
    return { ...user, location: record ? { id: record.id, ...s.decrypt(this.config.encryptionKey, userId, record.id, record.encrypted), updated_at: record.updated_at } : null };
  }
  async getLocation(userId, locationId) {
    if(typeof locationId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(locationId))throw new s.LiteError('NOT_FOUND',404);
    const row = await this.repo.get('SELECT * FROM locations WHERE id=? AND user_id=?', locationId, userId);
    if (!row) throw new s.LiteError('NOT_FOUND', 404);
    return { id: row.id, ...s.decrypt(this.config.encryptionKey, userId, row.id, row.encrypted), updated_at: row.updated_at };
  }
  async saveLocation(userId, input, locationId) {
    const payload = s.location(input);
    return this.repo.transaction(async () => {
      const active=await this.repo.get("SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE",userId);
      if(!active)throw new s.LiteError('NOT_FOUND',404);
      const old = await this.repo.get('SELECT id FROM locations WHERE user_id=?', userId);
      if (locationId && (!old || old.id !== locationId)) throw new s.LiteError('NOT_FOUND', 404);
      const id = old?.id || crypto.randomUUID();
      await this.repo.run('INSERT INTO locations(id,user_id,encrypted,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted=excluded.encrypted,updated_at=excluded.updated_at,public_enabled=0', id, userId, s.encrypt(this.config.encryptionKey, userId, id, payload), this.now());
      await this.audit(userId, 'location.saved'); return await this.getLocation(userId, id);
    });
  }
  async deleteLocation(userId, id) {
    if(typeof id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new s.LiteError('NOT_FOUND',404);
    return this.repo.transaction(async () => {
      if ((await this.repo.run('DELETE FROM locations WHERE id=? AND user_id=?', id, userId)).changes !== 1) throw new s.LiteError('NOT_FOUND', 404);
      await this.audit(userId, 'location.deleted');
    });
  }
  async logout(session) { await this.repo.run('DELETE FROM sessions WHERE token_hash=?', this.sessionHash(session)); }
  async deleteUser(userId, credential) {
    const user = await this.repo.get("SELECT recovery_hash FROM users WHERE id=? AND status='active'", userId);
    if (!s.validToken(credential) || !user || !s.same(user.recovery_hash, s.hash(credential))) throw new s.LiteError('RECOVERY_FAILED', 401);
    return this.repo.transaction(async () => {
      const active=await this.repo.get("SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE",userId);
      if(!active)throw new s.LiteError('NOT_FOUND',404);
      await this.repo.run('DELETE FROM locations WHERE user_id=?', userId);
      await this.repo.run('DELETE FROM sessions WHERE user_id=?', userId);
      await this.repo.run("UPDATE users SET status='deleted',recovery_hash=NULL WHERE id=?", userId);
      await this.audit(userId, 'identity.deleted');
    });
  }
  async health() { await this.repo.get('SELECT version FROM schema_migrations ORDER BY version LIMIT 1'); return true; }
  async close() { await this.repo.close(); }
}
Object.assign(Service.prototype, require('./postgres-community'));
module.exports = { Service };
