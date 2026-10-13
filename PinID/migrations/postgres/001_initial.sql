-- Greenfield PostgreSQL target for PinID Lite.
-- For empty installations only. Current runtime remains SQLite until adapter is merged.
-- Execute using a dedicated migration role in the target database.
CREATE SCHEMA IF NOT EXISTS pinid;
CREATE TABLE pinid.users (
  id uuid PRIMARY KEY,
  alias varchar(30) NOT NULL UNIQUE,
  recovery_hash char(64) UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted','suspended')),
  created_at timestamptz NOT NULL
);
CREATE TABLE pinid.invitations (
  id uuid PRIMARY KEY,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE TABLE pinid.locations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES pinid.users(id),
  encrypted text NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE pinid.sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES pinid.users(id),
  expires_at timestamptz NOT NULL
);
CREATE TABLE pinid.rate_limits (
  bucket char(64) PRIMARY KEY,
  count integer NOT NULL CHECK (count >= 0),
  expires_at timestamptz NOT NULL
);
CREATE TABLE pinid.settings (
  name text PRIMARY KEY,
  value text NOT NULL
);
CREATE TABLE pinid.audit_events (
  id uuid PRIMARY KEY,
  user_id uuid,
  action text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiry ON pinid.sessions(expires_at);
CREATE INDEX invitations_expiry ON pinid.invitations(expires_at);
