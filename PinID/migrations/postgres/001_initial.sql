-- PostgreSQL 17 greenfield v1; UTC epoch milliseconds preserve the existing API.

CREATE TABLE pinid.users (
  id uuid PRIMARY KEY,
  alias varchar(38) NOT NULL UNIQUE CHECK(alias ~ '^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]@pincode$'),
  recovery_hash char(64) UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted','suspended')),
  created_at bigint NOT NULL
);
CREATE TABLE pinid.invitations (
  id uuid PRIMARY KEY,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at bigint NOT NULL,
  consumed_at bigint
);
CREATE TABLE pinid.locations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES pinid.users(id),
  encrypted text NOT NULL,
  updated_at bigint NOT NULL
);
CREATE TABLE pinid.sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES pinid.users(id),
  expires_at bigint NOT NULL
);
CREATE TABLE pinid.rate_limits (
  bucket char(64) PRIMARY KEY,
  count integer NOT NULL CHECK (count >= 0),
  expires_at bigint NOT NULL
);
CREATE TABLE pinid.settings (
  name text PRIMARY KEY,
  value text NOT NULL
);
CREATE TABLE pinid.audit_events (
  id uuid PRIMARY KEY,
  user_id uuid,
  action text NOT NULL,
  created_at bigint NOT NULL
);
CREATE INDEX sessions_expiry ON pinid.sessions(expires_at);
CREATE INDEX invitations_expiry ON pinid.invitations(expires_at);
CREATE INDEX rate_limits_expiry ON pinid.rate_limits(expires_at);
