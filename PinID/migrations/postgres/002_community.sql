CREATE TABLE pinid.interest_requests (
 id uuid PRIMARY KEY, encrypted text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at bigint NOT NULL
);
CREATE TABLE pinid.admin_sessions(token_hash char(64) PRIMARY KEY,expires_at bigint NOT NULL);
ALTER TABLE pinid.locations ADD COLUMN public_enabled integer NOT NULL DEFAULT 0 CHECK(public_enabled IN (0,1));
CREATE INDEX interest_created ON pinid.interest_requests(created_at);
CREATE INDEX admin_sessions_expiry ON pinid.admin_sessions(expires_at);
