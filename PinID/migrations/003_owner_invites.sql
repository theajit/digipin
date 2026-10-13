CREATE TABLE owner_invites (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 request_id TEXT UNIQUE REFERENCES interest_requests(id) ON DELETE SET NULL,
 invitation_id TEXT UNIQUE REFERENCES invitations(id),
 created_at INTEGER NOT NULL
) STRICT;
CREATE TABLE invitation_links (
 invitation_id TEXT PRIMARY KEY REFERENCES invitations(id),
 request_id TEXT REFERENCES interest_requests(id) ON DELETE SET NULL,
 user_id TEXT REFERENCES users(id),
 mail_status TEXT NOT NULL DEFAULT 'not_sent' CHECK(mail_status IN ('not_sent','accepted','failed','disabled'))
) STRICT;
ALTER TABLE interest_requests ADD COLUMN kind TEXT NOT NULL DEFAULT 'registration' CHECK(kind IN ('registration','extra_handle'));
ALTER TABLE interest_requests ADD COLUMN notification_status TEXT NOT NULL DEFAULT 'not_sent' CHECK(notification_status IN ('not_sent','accepted','failed','disabled'));
ALTER TABLE interest_requests ADD COLUMN owner_user_id TEXT REFERENCES users(id);
