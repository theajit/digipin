'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { hash, LiteError } = require('./security');
class Repository {
  constructor(directory) {
    // Separate OS-backed SQLite exclusive lock is released on crash/restart.
    this.guard = new DatabaseSync(path.join(directory, 'writer-lock.sqlite'));
    try {
      this.guard.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE');
      this.db = new DatabaseSync(path.join(directory, 'pinid.sqlite'));
      this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;');
      this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL) STRICT');
      const sql = fs.readFileSync(path.join(__dirname, '../migrations/001.sql'), 'utf8').replace(/\r\n/g, '\n');
      const version = this.get('SELECT checksum FROM schema_migrations WHERE version=1');
      if (version && version.checksum !== hash(sql)) throw new Error('PinID Lite migration checksum mismatch');
      if (!version) this.transaction(() => {
        this.db.exec(sql);
        this.run('INSERT INTO schema_migrations VALUES(1,?)', hash(sql));
      });
    } catch (error) { this.close(); throw error; }
  }
  get(sql, ...args) { return this.db.prepare(sql).get(...args); }
  all(sql, ...args) { return this.db.prepare(sql).all(...args); }
  run(sql, ...args) { return this.db.prepare(sql).run(...args); }
  transaction(work) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  rate(bucket, maximum, windowSeconds, now) {
    this.run('DELETE FROM rate_limits WHERE expires_at<=?', now);
    const row = this.get('SELECT count FROM rate_limits WHERE bucket=?', bucket);
    if (row && row.count >= maximum) throw new LiteError('RATE_LIMITED', 429);
    this.run('INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1', bucket, now + windowSeconds * 1000);
  }
  close() {
    if (this.db) { this.db.close(); this.db = null; }
    if (this.guard) { this.guard.close(); this.guard = null; }
  }
}
module.exports = { Repository };
