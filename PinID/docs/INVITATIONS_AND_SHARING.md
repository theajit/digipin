# Administrator invitations, interest queue and optional public resolution

Later product update: users can now issue one personal invitation immediately through Resend. See [plans and invitations](PLANS_AND_INVITATIONS.md); public registration requests still use the administrator queue. The administrator-only issuance description below records the earlier release.

User-authorized product expansion: platform administrators only create/review invitations; queue fields are name, phone, email and desired username; anyone may resolve a handle only after its owner explicitly enables sharing. This supersedes the initial no-public-resolution beta wording. No government verification, affiliation, address ownership proof, OAuth, payments or private third-party access is introduced.

## Architecture, privacy and threat decisions

Additive migration 002 adds encrypted interest_requests, verifier-only admin_sessions, and locations.public_enabled default 0. Existing UUIDs, ciphertext, secrets and user/location records remain intact. SQLite now tracks every numbered migration; PostgreSQL uses the existing checksum/transaction/advisory-lock runner. Explicit insert columns preserve v1 locations despite the added column. New locations and location updates are private; updating/deleting an address resets public sharing. No data movement or new database provisioning.

Administrator login exchanges the existing private admin credential over HTTPS for an independent one-hour HttpOnly/Secure/SameSite Strict cookie. Admin session verifiers are HMAC-bound to the admin secret; rotating it invalidates sessions. Owner recovery/session cookies cannot authenticate administrator operations. Admin mutations require exact Origin, JSON and CSRF; browser credentials are never placed in URLs/localStorage or embedded in HTML. The credential field is cleared on submission; invitation tokens are displayed once and cleared on acknowledgement/page exit. No email/SMS delivery is automated. The administrator delivers tokens privately out of band.

Queue details are AES-GCM encrypted using separate interest-queue AAD/derivation context and request UUID. Application does not log them. Submission is rate-limited and never confirms alias availability. Queue membership/approval does not reserve a username or create an identity; normal transactional enrollment claims the alias. Approval atomically updates pending status, creates one hashed invitation and audits without contact data. Repeated approval fails; lost displayed tokens cannot be retrieved, but an administrator can create a new invitation. Cursor pagination uses timestamp and UUID to avoid equal-timestamp omissions. Admin can delete request contact data, approve or reject. Operators must publish contact and queue/backup retention policies before collecting actual applicants; no automated delivery or identity verification is claimed.

Public resolve is POST with handle in JSON, avoiding URL/query logs. Unknown/private/invalid handles fail without a public alias-availability oracle. Output is exactly handle, canonical ten-character DIGIPIN, latitude and longitude; never label/notes/contact/UUID/session information. Public results use no-store. Browser cross-origin access is allowed only on the resolver to https://digipin.pincode.cafe; no cross-origin cookies/credentials or private/admin API permission. Owner authentication+CSRF and explicit confirmation are required to enable sharing; disabling needs no confirmation. Requests already in flight or copies previously saved by others cannot be recalled. Public scraping remains possible for opted-in handles; rate limits reduce abuse but do not make public coordinates confidential. Public lookups and interest submissions use separate rate buckets from owners.

Shared community service methods have synchronous SQLite and asynchronous PostgreSQL implementations matching existing dual-backend boundaries. PostgreSQL approval and owner sharing use row locks within transactions. Duplication requires matched contract tests; both backends run the same test helper.

## API additions

The owner opt-in is also stored within the authenticated encrypted location payload as public_sharing. Resolver requires both the visibility flag and that protected opt-in. Toggling the database flag alone cannot expose a never-shared location. Owner sharing changes re-encrypt only that owner's payload with the existing algorithm/AAD. Database snapshot replay can still restore previously opted-in records; backup/revocation reconciliation remains necessary. The ciphertext envelope/keys/algorithm stay compatible; exported owner records may include their sharing flag.

Existing paths/encode engine remain unchanged. Prefix /api (legacy /pinid/api also works). All request JSON strict fields; error contract unchanged. Public resolve may return 404, 429 or generic 503; unauthorized admin returns 401, missing CSRF/wrong Origin 403. Interest submission returns 202 status received, not availability.

| Endpoint | Contract |
|---|---|
| POST /interest | name <=100, phone 7..15 digits with optional formatting, email <=254, username 3..30, confirmed=true |
| POST /resolve | {handle:"ajit@pincode"}; public opted-in fields only |
| GET /sharing | owner cookie; {enabled:boolean} |
| PUT /sharing | owner cookie+CSRF; {enabled:boolean,confirmed?:boolean}; true requires confirmed=true |
| POST /admin/login | {credential}; admin cookie plus csrf |
| GET /admin/me | administrator cookie; csrf |
| POST /admin/queue | administrator+CSRF; optional before:{time,id}; items and next_cursor, 50 per page |
| POST /admin/invitations | administrator+CSRF, {}; one-time token, 48-hour expiry |
| POST /admin/requests/:id | administrator+CSRF; {decision:"approve" or "reject"}; approve returns one-time token |
| DELETE /admin/requests/:id | administrator+CSRF, {}; deletes live contact request |
| POST /admin/logout | administrator+CSRF, {}; revokes cookie/session |

UI: / offers interest form and shared-handle lookup; owner dashboard includes sharing controls; /admin.html is the invitation desk. Platform administrator uses existing PINID_ADMIN_SECRET privately. Enrolled users have no invitation desk authority.

## DIGIPIN UI integration and deployment

Separate PR targets **digipin-ui**, never pinid/main, from digipin-ui-pinid-resolver. Inspected sibling checkout is the same theajit/digipin repo's digipin-ui branch (React 19/Vite 7/TypeScript). A standalone component calls name.pincode.cafe/api/resolve with credentials omitted and POST JSON. Existing encode/decode/Plus Code functionality is untouched. Production VITE_PINID_ORIGIN defaults to https://name.pincode.cafe. Public result is not added to persistent browser history or storage. Failed/revoked lookups clear prior displayed results.

Deploy PinID API migration 002 first after review. Existing PostgreSQL restricted runtime roles need DML privileges on the two new tables; configure default privileges or grant them using the migration role. An explicitly shared migration/runtime role already owns its new tables, with the previously documented privilege tradeoff. Verify both schemas/checksums, then deploy reviewed digipin-ui build; no DNS change or Dockerfile needed. Neither deployment is performed here. Production Origin must exactly match config; do not enable wildcard CORS. Local browser QA uses only synthetic data and an explicit fixture-only local resolver Origin, which is not exposed as a production env setting.

## Verification and rollback

Executed backend assertions cover encrypted contact records, owner/admin separation, cookie flags/CSRF, single approval/replay, pagination with equal timestamps, private-by-default lookup, consent confirmation, exact output fields, CORS isolation, revocation/update/delete, partial approval rollback and PostgreSQL sharing across pools. Existing invitation, recovery, encryption, outage, restart and migration regressions remain. Test-generated data lives in ignored test-data. Exact final matrix/build results are reported on PRs; no production durability/live TLS validation is claimed.

Actual local Edge flow: submitted synthetic interest; admin logged in, approved request and hid token before screenshot; synthetic ajit owner recovered, enabled sharing; handle resolved in PinID and DIGIPIN UI; revoked sharing and verified DIGIPIN reports unavailable. Screenshots under root ignored test-data/evidence: interest-queue-ui.jpg, admin-queue-ui.jpg, admin-approved-ui.jpg, owner-sharing-ui.jpg, pinid-resolution-ui.jpg, digipin-resolution-ui.jpg, public-resolution-revoked-ui.jpg. No live contact/credential/token appears in evidence.

Rollback: stop writer, restore prior compatible code retaining database and secrets; do not drop the new columns/tables or remove version history. Previous service inserts must be made compatible with added location column before reuse; prefer a forward fix rather than blindly downgrading. To stop all public retrieval quickly, deploy a reviewed resolver-disabled change or revoke sharing flags through an authorized maintenance transaction, not delete locations. Restore previous DIGIPIN UI build independently. Queue backups may retain deleted data until retention expiry. No automatic merge/deploy or real-data transfer.

GO for review only when CI is green on both Node versions/PostgreSQL versions and DIGIPIN build passes. Production release needs operator queue/contact retention/privacy notice, credential handling, backup and route/logging verification. Public sharing permanently discloses coordinates to any successful viewer; disabling stops future retrieval, not existing copies.
