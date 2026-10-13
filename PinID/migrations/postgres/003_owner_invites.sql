CREATE TABLE pinid.owner_invites (
 user_id uuid PRIMARY KEY REFERENCES pinid.users(id),
 request_id uuid UNIQUE REFERENCES pinid.interest_requests(id) ON DELETE SET NULL,
 invitation_id uuid UNIQUE REFERENCES pinid.invitations(id),
 created_at bigint NOT NULL
);
CREATE TABLE pinid.invitation_links (
 invitation_id uuid PRIMARY KEY REFERENCES pinid.invitations(id),
 request_id uuid REFERENCES pinid.interest_requests(id) ON DELETE SET NULL,
 user_id uuid REFERENCES pinid.users(id),
 mail_status text NOT NULL DEFAULT 'not_sent' CHECK(mail_status IN ('not_sent','accepted','failed','disabled'))
);
ALTER TABLE pinid.interest_requests ADD COLUMN kind text NOT NULL DEFAULT 'registration' CHECK(kind IN ('registration','extra_handle'));
ALTER TABLE pinid.interest_requests ADD COLUMN notification_status text NOT NULL DEFAULT 'not_sent' CHECK(notification_status IN ('not_sent','accepted','failed','disabled'));
ALTER TABLE pinid.interest_requests ADD COLUMN owner_user_id uuid REFERENCES pinid.users(id);
