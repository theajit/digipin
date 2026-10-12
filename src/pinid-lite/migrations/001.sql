CREATE TABLE users (
  id TEXT PRIMARY KEY,
  alias TEXT NOT NULL UNIQUE,
  recovery_hash TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','deleted','suspended')),
  created_at INTEGER NOT NULL
) STRICT;
CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
) STRICT;
CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  encrypted TEXT NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
) STRICT;
CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;
CREATE TABLE settings (name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX invitations_expiry ON invitations(expires_at);
