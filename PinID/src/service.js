'use strict';
const crypto = require('node:crypto');
const { Repository } = require('./repository');
const s = require('./security');
class Service {
  constructor(config, now = Date.now) {
    this.config = config; this.now = now; this.repo = new Repository(config.directory);
    try {
      const check = this.repo.get("SELECT value FROM settings WHERE name='key-check'");
      if (check) {
        if (s.decrypt(config.encryptionKey, 'configuration', 'key-check', check.value).check !== 'pinid-lite-v1') throw new Error('Invalid key');
      } else this.repo.run("INSERT INTO settings VALUES('key-check',?)", s.encrypt(config.encryptionKey, 'configuration', 'key-check', { check: 'pinid-lite-v1' }));
    } catch { this.close(); throw new Error('PinID Lite encryption key does not match database'); }
  }
  audit(userId, action) {
    this.repo.run('INSERT INTO audit_events VALUES(?,?,?,?)', crypto.randomUUID(), userId, action, this.now());
  }
  sessionHash(value) { return crypto.createHmac('sha256', this.config.sessionSecret).update(value).digest('hex'); }
  csrf(value) { return crypto.createHmac('sha256', this.config.sessionSecret).update(`csrf:${value}`).digest('base64url'); }
  rate(ip, action) {
    const key = this.sessionHash(`rate:${ip}:${action}`);
    this.repo.rate(this.sessionHash(`global:${action}`), action === 'owner' ? 300 : 60, 600, this.now());
    this.repo.rate(key, action === 'owner' ? 120 : 10, 600, this.now());
  }
  invite(seconds = 172800) {
    if (!Number.isInteger(seconds) || seconds < 60 || seconds > 604800) throw new s.LiteError('INVALID_REQUEST');
    const invitation = s.token(); const expiresAt = this.now() + seconds * 1000;
    this.repo.transaction(() => {
      this.repo.run('INSERT INTO invitations VALUES(?,?,?,NULL)', crypto.randomUUID(), s.hash(invitation), expiresAt);
      this.audit(null, 'invitation.created');
    });
    return { invitation, expires_at: expiresAt };
  }
  createSession(userId) {
    const session = s.token();
    this.repo.run('DELETE FROM sessions WHERE expires_at<=?', this.now());
    // A fresh recovery login revokes prior sessions, reducing stolen-cookie exposure.
    this.repo.run('DELETE FROM sessions WHERE user_id=?', userId);
    this.repo.run('INSERT INTO sessions VALUES(?,?,?)', this.sessionHash(session), userId, this.now() + this.config.sessionSeconds * 1000);
    return session;
  }
  enroll(input) {
    s.fields(input, ['invitation', 'username', 'location'], ['invitation', 'username', 'location']);
    if (!s.validToken(input.invitation)) throw new s.LiteError('ENROLLMENT_FAILED', 400);
    const name = s.alias(input.username); const payload = s.location(input.location);
    const userId = crypto.randomUUID(); const locationId = crypto.randomUUID(); const recovery = s.token();
    try {
      return this.repo.transaction(() => {
        const invite = this.repo.get('SELECT id FROM invitations WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?', s.hash(input.invitation), this.now());
        if (!invite) throw new s.LiteError('ENROLLMENT_FAILED');
        this.repo.run('INSERT INTO users VALUES(?,?,?,\'active\',?)', userId, name, s.hash(recovery), this.now());
        this.repo.run('INSERT INTO locations(id,user_id,encrypted,updated_at) VALUES(?,?,?,?)', locationId, userId, s.encrypt(this.config.encryptionKey, userId, locationId, payload), this.now());
        const consumed = this.repo.run('UPDATE invitations SET consumed_at=? WHERE id=? AND consumed_at IS NULL', this.now(), invite.id);
        if (consumed.changes !== 1) throw new s.LiteError('ENROLLMENT_FAILED');
        const session = this.createSession(userId); this.audit(userId, 'identity.enrolled');
        return { session, recovery_credential: recovery, profile: this.profile(userId) };
      });
    } catch (error) {
      if (error instanceof s.LiteError) throw error;
      if (String(error.code).includes('SQLITE') && /UNIQUE constraint/.test(error.message)) throw new s.LiteError('ENROLLMENT_FAILED');
      throw error;
    }
  }
  recover(value) {
    // Hash a dummy for malformed credentials and return the same external failure.
    const hash = s.hash(s.validToken(value) ? value : 'invalid-credential');
    const user = this.repo.get("SELECT id FROM users WHERE recovery_hash=? AND status='active'", hash);
    if (!user || !s.validToken(value)) throw new s.LiteError('RECOVERY_FAILED', 401);
    return this.repo.transaction(() => { const session = this.createSession(user.id); this.audit(user.id, 'session.recovered'); return { session, profile: this.profile(user.id) }; });
  }
  owner(session) {
    if (!s.validToken(session)) throw new s.LiteError('UNAUTHORIZED', 401);
    const user = this.repo.get("SELECT users.id FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>? AND users.status='active'", this.sessionHash(session), this.now());
    if (!user) throw new s.LiteError('UNAUTHORIZED', 401);
    return user.id;
  }
  profile(userId) {
    const user = this.repo.get("SELECT id,alias,created_at FROM users WHERE id=? AND status='active'", userId);
    if (!user) throw new s.LiteError('NOT_FOUND', 404);
    const record = this.repo.get('SELECT * FROM locations WHERE user_id=?', userId);
    return { ...user, location: record ? { id: record.id, ...s.decrypt(this.config.encryptionKey, userId, record.id, record.encrypted), updated_at: record.updated_at } : null };
  }
  getLocation(userId, locationId) {
    const row = this.repo.get('SELECT * FROM locations WHERE id=? AND user_id=?', locationId, userId);
    if (!row) throw new s.LiteError('NOT_FOUND', 404);
    return { id: row.id, ...s.decrypt(this.config.encryptionKey, userId, row.id, row.encrypted), updated_at: row.updated_at };
  }
  saveLocation(userId, input, locationId) {
    const payload = s.location(input);
    return this.repo.transaction(() => {
      const old = this.repo.get('SELECT id FROM locations WHERE user_id=?', userId);
      if (locationId && (!old || old.id !== locationId)) throw new s.LiteError('NOT_FOUND', 404);
      const id = old?.id || crypto.randomUUID();
      this.repo.run('INSERT INTO locations(id,user_id,encrypted,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted=excluded.encrypted,updated_at=excluded.updated_at,public_enabled=0', id, userId, s.encrypt(this.config.encryptionKey, userId, id, payload), this.now());
      this.audit(userId, 'location.saved'); return this.getLocation(userId, id);
    });
  }
  deleteLocation(userId, id) {
    this.repo.transaction(() => {
      if (this.repo.run('DELETE FROM locations WHERE id=? AND user_id=?', id, userId).changes !== 1) throw new s.LiteError('NOT_FOUND', 404);
      this.audit(userId, 'location.deleted');
    });
  }
  logout(session) { this.repo.run('DELETE FROM sessions WHERE token_hash=?', this.sessionHash(session)); }
  deleteUser(userId, credential) {
    const user = this.repo.get("SELECT recovery_hash FROM users WHERE id=? AND status='active'", userId);
    if (!s.validToken(credential) || !user || !s.same(user.recovery_hash, s.hash(credential))) throw new s.LiteError('RECOVERY_FAILED', 401);
    this.repo.transaction(() => {
        this.repo.run('DELETE FROM interest_requests WHERE id IN (SELECT request_id FROM owner_invites WHERE user_id=?)', userId);
        this.repo.run('DELETE FROM interest_requests WHERE owner_user_id=?', userId);
      this.repo.run('DELETE FROM locations WHERE user_id=?', userId);
      this.repo.run('DELETE FROM sessions WHERE user_id=?', userId);
      this.repo.run("UPDATE users SET status='deleted',recovery_hash=NULL WHERE id=?", userId);
      this.audit(userId, 'identity.deleted');
    });
  }
  health() { return this.repo.get('SELECT 1 AS ok').ok === 1; }
  close() { this.repo.close(); }
}
Object.assign(Service.prototype, require('./community'));
Object.assign(Service.prototype, require('./owner-invites'));
Object.assign(Service.prototype, require('./request-export'));
module.exports = { Service };
