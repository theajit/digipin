# Free allowance, invitation emails and additional-handle requests

## Product decisions

One free `username@pincode` handle has one address. Existing uniqueness constraints already enforce one alias and one location per identity; this release does not increase that allowance. Each additional handle is priced at ₹199/year, with one address per handle. At the user's request, additional handles currently use an email request flow, not payment collection or automatic activation. A submitted request does not reserve a username, start billing or create an extra identity. Approval for an extra-handle request cannot issue a free registration invitation. Multi-handle ownership, paid entitlement/expiry, collection, taxes, refunds and renewal fulfillment remain future work.

Every active user can invite one person immediately by providing their name, email and phone and confirming permission to share those details. No administrator approval is needed for that personal invitation. The administrator can see every issued invitation, its inviter, recipient details when recorded, expiry, redemption and email acceptance status. A lifetime per-identity database ledger enforces the limit, including concurrent requests. Expiry, deletion of request details and resend do not reset it. This is a per-account rule; verified-person/Sybil enforcement is not implemented.

Invitation codes expire after 48 hours and are single-use. Only their hashes are stored. Recipient contacts are encrypted with the existing authenticated-encryption contract and a separate interest-queue context. Issuance commits before any email request; provider failure does not roll back the invitation allowance. The owner may resend to the same saved recipient: it atomically invalidates the old code, issues a new one, and keeps the same allowance. A redeemed or removed invitation cannot be resent. The recipient's email/phone are not independently verified; the code is a bearer credential, not residence/identity verification.

## Resend integration and privacy

Server-side `POST https://api.resend.com/emails` uses the documented [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email) and [idempotency header](https://resend.com/docs/dashboard/emails/idempotency-keys). No new dependency is required. The endpoint is fixed; redirects are rejected, calls time out after 10 seconds and external exception/provider bodies are not logged or returned. Keys are never exposed in the UI. Tokens are in the email body, never links, logs or persisted outboxes.

Invitation activity and additional-handle notifications go to `invite@pincode.cafe`, CC `ajit@pincode.cafe`, with name, email, phone and requested alias where applicable. Individual invitation codes go only to the recipient; admin notification emails do not contain the code. Private locations, notes, coordinates and sign-in/recovery keys are never included. Contact information and invitation codes therefore pass through Resend and recipient mail systems; deletion from PinID cannot delete email copies. Update the operator's privacy/retention and provider agreements before production email use.

`accepted` means Resend accepted the API call, not inbox delivery. No webhook/bounce handling is implemented. Notification failure leaves the encrypted request in the administrator queue, where the administrator may retry its notification. Resend's idempotency window is 24 hours; notification retries after that can duplicate a notification. Invitation retries always replace the old token, so a crash or ambiguous response can produce another email with the old code invalid. No background retry worker stores tokens. SMTP delivery, sender verification, domain setup, inbox behavior and live Resend credentials remain unverified.

## API

All paths below are under `/api`. Existing owner cookies, exact-origin/JSON checks, CSRF and persisted rate limits apply. No user-controlled destination or CC is accepted.

| Route | Contract |
| --- | --- |
| GET /my-invitation | Owner; used/status, email_enabled and provider acceptance status (delivery). No recipient details or codes. |
| POST /my-invitation | Owner+CSRF; `{name,email,phone,confirmed:true}`; immediate issuance and Resend attempt; 202 used/status/delivery/notification, no code returned to the inviter. |
| POST /my-invitation/resend | Owner+CSRF, `{}`; replaces unredeemed code for the same person, attempts email; does not reset quota. |
| POST /handle-requests | Owner+CSRF; `{name,email,phone,username,confirmed:true}`; 202 request/notification status only. No alias allocation or payment. |
| POST /admin/invitations/list | Admin+CSRF; optional `{before:{time,id}}`; up to 50 per page with next_cursor; all issued records, never code/hash/session secrets. |
| POST /admin/invitations | Admin+CSRF; contact fields+confirmed; issue and email invitation. Empty legacy body remains supported only when email is disabled; CLI invitation generation is preserved. |
| POST /admin/requests/:id/notify | Admin+CSRF, `{}`; retry fixed team notification. |

The existing public interest endpoint now attempts a team notification. Its saved record remains available if email fails or is disabled. Owner invitation/handle email routes refuse missing email configuration before issuing records. New errors: `INVITE_LIMIT_REACHED` (409), `INVITATION_UNAVAILABLE` (409), `HANDLE_FULFILLMENT_UNAVAILABLE` (409), `RECIPIENT_REQUIRED` (400), `EMAIL_NOT_CONFIGURED` (503). New invitation/resend/handle attempts have separate persisted 10-per-peer/60-global quotas per 10 minutes. Cross-owner IDs are not accepted in payloads.

## Schema and deployment

Additive migration 003 introduces `owner_invites` (user UUID primary key/lifetime quota), `invitation_links` (each issuance/contact linkage/email status), and request kind, notification status and owner linkage columns. Existing users, UUIDs, encrypted locations, recovery/session hashes and invitation hashes remain intact. Migration checksum and concurrency locking follow existing SQLite/PostgreSQL mechanisms. No live data movement was performed.

Dokploy uses the existing direct Node setup, working directory `PinID`, `npm ci --ignore-scripts`, `npm start`. Keep existing storage/key/origin/database settings. Add:

```ini
PINID_EMAIL_ENABLED=true
RESEND_API_KEY=<server-side Resend sending key>
PINID_EMAIL_FROM=pinid@pincode.cafe
```

Use a sender verified in your Resend account. The sample address does not assert verification. Enabling email without valid key/sender config fails startup with an allowlisted hint. Never put secrets in source control. PostgreSQL can use the already reviewed `PINID_AUTO_MIGRATE=true` configuration to apply migration 003, or the migration CLI with the reviewed migration role. Grant the runtime role access to the new tables under the existing least-privilege policy. SQLite applies it on startup. Do not run multiple SQLite writers.

Smoke checks: `/healthz`; synthetic owner sign-in; issue one invitation; verify accepted versus failed email status in administrator UI; reject a second person; resend and reject the old code; submit an additional-handle request and confirm no new alias. No production email or deployment was performed by this work.

## Rollback and failure cases

Back up the database and retain encryption keys before release. Existing schema verifiers reject unknown migration versions: **do not deploy a pre-003 binary directly against a migrated database**. For additive rollback, revert feature routes/UI/services while retaining migration 003 and updated schema verification, then deploy that reviewed rollback release. Keep ledger/link tables to preserve quota and audit history. Alternatively restore a pre-release database backup only under an explicit data-loss/cutover plan; never drop tables automatically. Setting `PINID_EMAIL_ENABLED=false` stops new mail-dependent invitation/handle requests but keeps owner/location APIs and manual administrator CLI available. Already emailed codes remain valid until consumed/expired/replaced.

Tests executed locally on Node 24.20 with disposable SQLite and PostgreSQL 18: 68 tests passed, including clean install and v2-to-v3 upgrades, invitation races, quota persistence, audit rollback, invalid contacts, owner/CSRF denial, immediate issuance, expiry, replacement, redemption, encrypted contact deletion, owner export isolation, fixed notification/CC recipients, simulated provider failure, no raw token API disclosure, no address content in mail, and no extra-handle activation. Syntax checks passed. All mail tests use a local fake Resend boundary; these results do not claim live email delivery. Generated records, credentials and screenshots are Git-ignored under test-data.

GO for PR review. NO-GO for claiming live email delivery or paid-handle fulfillment before sender configuration and operator verification.
