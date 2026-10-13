CREATE TABLE interest_requests (
 id TEXT PRIMARY KEY, encrypted TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at INTEGER NOT NULL
) STRICT;
CREATE TABLE admin_sessions (token_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL) STRICT;
ALTER TABLE locations ADD COLUMN public_enabled INTEGER NOT NULL DEFAULT 0 CHECK(public_enabled IN (0,1));
CREATE INDEX interest_created ON interest_requests(created_at);
CREATE INDEX admin_sessions_expiry ON admin_sessions(expires_at);
