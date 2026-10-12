# PinID — by Pin Code Café

This dedicated folder contains the explicitly authorized Lite exception to [PR-00 architecture](https://github.com/theajit/digipin/blob/pinid/docs/PINID_ARCHITECTURE.md), not completion of PR-01–05. One `username@pincode`, one private confirmed location, invite enrollment and a random owner recovery credential. No public resolution, OAuth, consent grants, third parties, payments or KitchenOS. The locally bundled DIGIPIN engine remains unchanged. Legacy API runtime/files are absent from this branch; other DIGIPIN branches and deployments remain independent.

## Folder and brand

Branch: `pinid`. Product host remains `name.pincode.cafe`; address identities remain `username@pincode`. This is a self-contained application in this repository: its own server, UI, API, dependencies and unmodified locally bundled DIGIPIN engine. The legacy DIGIPIN application remains on its own branches.

```text
PinID/
  src/          configuration, security, routes, services and SQLite repository
  migrations/   numbered schema migration
  public/       responsive UI and local Pin Code Café logo
  test/         private vault, invitation, authorization and restart tests
  scripts/      administrator invitation CLI
  docs/         verification and branding decisions
  .env.example  placeholder configuration
  package.json  convenience start/test/invite scripts
```

Copy or deploy only `PinID/`. Inside that folder run `npm ci --ignore-scripts`, `npm run check`, `npm test`, then `npm start` with private `.env` configuration. No root files or dependencies are needed. UI is `/`, private API is `/api`, and health is `/healthz`. The old `/pinid/api` prefix is retained as a compatibility alias on this server. No `/api/digipin` endpoint is present in PinID.

The visual family follows the live [DIGIPIN portal](https://digipin.pincode.cafe) and [194.194 Cult](https://cult.pincode.cafe): ink black, warm paper, strong borders, generous type and the existing café logo. PinID uses the DIGIPIN orange accent, rather than Cult's lime community accent. Fonts and brand assets are local/system-only; no analytics, remote font request or external image request is added to the private vault. See [branding decisions](docs/BRANDING.md) and [verification](docs/VERIFICATION.md).

## Architecture differences and limits

CommonJS Express with route/service/repository/security boundaries. Node >=22.18 is required; Node 24 is recommended. `node:sqlite` avoids a new/native dependency and remains experimental in these LTS versions. SQLite has a numbered checksum-tracked additive migration, UNIQUE aliases, `BEGIN IMMEDIATE` enrollment, WAL and FULL synchronization. A separate SQLite exclusive writer lock prevents a second server on the same volume and automatically releases on exit/crash. This requires a host-local filesystem supporting SQLite locks, never NFS/shared network volumes or serverless/ephemeral deployments.

Admin invitations are bearer credentials delivered privately after out-of-band recipient checks; this Lite release does not perform verified-recipient binding or government verification. Account ownership is possession of a 256-bit recovery credential, not a password/OIDC identity. Invitation/recovery verifiers use SHA-256 for uniformly random tokens; sessions and rate buckets use HMAC with a separate secret. Sessions persist for one hour, use Secure/HttpOnly/SameSite Strict cookies and are revoked on recovery login. State-changing owner requests require exact Origin, JSON and a session-bound CSRF header. No trust-proxy setting is enabled; rate limits use the socket peer, so users behind the same proxy share quotas. Do not trust arbitrary forwarded headers to bypass this.

Sensitive labels/address/coordinates/DIGIPIN are encrypted together with AES-256-GCM, unique random nonce, HKDF-derived per-owner key and owner/location/version AAD. This is a documented beta substitute for PR-00 KMS envelope keys. A startup canary detects wrong encryption keys; key rotation/migration is not implemented. Keep the master key backed up outside the volume; losing it makes locations unrecoverable. Do not change it in-place. Rotating session/admin secrets invalidates sessions/admin access, not recovery verifiers.

Alias tombstones prevent reuse after deletion. Delete removes live encrypted records and invalidates recovery/sessions; WAL/backups/audit may retain prior data until maintenance/retention expiry. No promise of immediate cryptographic erasure. Operators must set their contact, recipient-delivery process, audit/backup retention and privacy notice before inviting users. Lite UI links its own notice, not copied government-issued policies. The independent PinID dependency install reported zero advisories on 2026-10-13. Legacy root dependency findings remain unchanged; proxy trust remains disabled in PinID.

## Configuration / storage gate

Lite is disabled unless `PINID_LITE_ENABLED=true`. Disabled mode needs no storage/secrets and returns 503; the separate legacy server is unaffected. Enabled mode refuses startup without:

- `PINID_ORIGIN`: exact external HTTPS origin, normally `https://name.pincode.cafe`, no trailing slash/path.
- `PINID_DATA_DIR`: existing absolute writable directory on a mounted durable host-local volume.
- `.pinid-durable-volume` inside that directory containing `pinid-lite-local-volume-v1`.
- `PINID_SINGLE_WRITER=true` and `PINID_STORAGE_CONFIRMED=true`, operator assertions backed by a storage/restart check.
- Three distinct `PINID_ENCRYPTION_KEY`, `PINID_SESSION_SECRET`, `PINID_ADMIN_SECRET`: each random 32-byte base64url.

Generate each secret privately with `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"`. Store them in the platform secret manager or private `.env`; never Git, the database, image layers, URLs, browser localStorage or proxy/application logs. File mode 0600 for secret files and restricted volume permissions. `PinID/.env.example` contains placeholders only.

Local development only: `NODE_ENV=development`, `PINID_ALLOW_LOCAL_HTTP=true`, exact localhost origin and the same explicit storage gate. Production cannot enable the HTTP exception. Creating a marker does not prove actual durability: verify the mount/restart before enabling users.

## Direct Node deployment — no Docker

For Dokploy, deploy branch `pinid` with build path `/PinID`; use the Node builder, `npm ci --ignore-scripts`, `npm run check`, and start `node server.js`. Node >=22.18 is required (24 recommended). Set `PINID_HOST=0.0.0.0`, `PORT=5001`, exact HTTPS `PINID_ORIGIN`, and route the domain to container port 5001. Mount a durable host-local directory at `/data` and provision the storage marker there before enabling. Use exactly one writer pinned to that host; stop the old writer before replacing it. Configure the three separate secrets privately; never put them in build commands. Do not deploy this branch into the existing DIGIPIN application.

Listener failure exits with a generic message and status 1. Check `PINID_HOST` and port conflicts; the server only prints its bound address after the native listening event. It does not expose resolver errors or a stack trace.

Actual API hosting/replicas/storage/TLS remain unverified. Before enabling, confirm a single Node process and a durable host-local filesystem. Do not use PM2 cluster mode, autoscaling, replicas, serverless/ephemeral disks or network/NFS volumes. No deployment is performed here.

1. Install Node 24 and run `npm ci --ignore-scripts` inside `PinID/`.
2. Create a restricted persistent directory outside the checkout, for example `/var/lib/pinid-lite`, owned by the service account with mode 0700. On Windows, use a durable absolute local directory with restrictive ACLs. Create `.pinid-durable-volume` inside it containing `pinid-lite-local-volume-v1`; restrict the marker to the service account.
3. Configure the required secrets in your service manager or private `.env`. Set `PINID_DATA_DIR` to that directory. Verify storage survives service restarts before setting both storage confirmation flags true.
4. Start through the existing Node service manager using exactly one process: `NODE_ENV=production npm start`. On PowerShell set environment variables separately, then use `npm.cmd start`. Restrict port 5001 to the trusted proxy/firewall; external access must use HTTPS.
5. Route the whole `https://name.pincode.cafe` host to this Node process. Bind `PINID_HOST=127.0.0.1` (default) behind a local trusted proxy; use an explicit interface only when needed. Disable proxy request-body/query/cookie/authorization logging, analytics and caching. Rate limits deliberately use socket-peer IP, so reverse proxy users share narrow-beta quotas.
6. Restart the actual service using a synthetic invited account and verify recovery plus decrypted retrieval. A green health endpoint alone does not prove durable storage. If the existing platform cannot retain a safe local directory, leave Lite disabled and use the full PostgreSQL design.

## Health / smoke / invitation generation

```sh
curl --fail https://name.pincode.cafe/healthz
curl --fail https://name.pincode.cafe/api/health
```

A confirmed location at 12.972579,77.592015 produces `4P3JK83M28`; `/healthz` must say Lite enabled. Use a private admin terminal and run `node scripts/invite.js` inside `PinID/` with configured environment, or `npm --prefix PinID run invite` with `PinID/.env`, to generate a 48-hour invitation (token displayed once). Do not send admin secret to the browser. Deliver invitation separately from the enrollment site URL; never put it in a URL/query. Open `/`, claim a synthetic alias, confirm location and save the owner credential. Sign out, return using it, update/export/delete, restart service and recover again. Admin CLI output is intentional one-time credential delivery; never pipe it to shared logs.

## API contract

Base `/api`; errors `{error:{code}}`, no-store responses. No query parameters. JSON max 8 KB, strict field validation. Origin required for POST/PUT/DELETE. Owner writes also require `X-PinID-CSRF` from enrollment/recovery or GET me. Cookie is the only owner authentication, not a URL credential or supplied owner UUID. API returns location only to its owner. There is no public alias search.

| Method/path | Auth / body / response |
| --- | --- |
| GET /health | public status only |
| POST /invitations | admin `X-PinID-Admin`; `{expires_in_seconds?:60..604800}`; 201 `{invitation,expires_at}` |
| POST /enroll | invitation; `{invitation,username,location}`; 201 profile, csrf, one-time recovery_credential, session cookie |
| POST /recover | `{credential}`; 200 profile/csrf + fresh cookie, revokes previous sessions |
| GET /me | owner profile/alias/private location/csrf |
| GET /me/export | owner JSON record download |
| DELETE /me | owner + CSRF + `{credential}`; delete live identity data, reserve alias, revoke sessions; 204 |
| POST /logout | owner + CSRF + `{}`; 204, revoke cookie/session |
| PUT /location | owner + CSRF; replace/create the single location |
| GET/PUT/DELETE /locations/:id | owner only; wrong owner's ID -> 404; writes CSRF required; DELETE `{}` |

Location body: `{label?:string<=60,latitude:number,longitude:number,confirmed:true,source?:"gps"|"manual",address?:string<=500}`; finite coordinates within latitude 2.5..38.5 and longitude 63.5..99.5. API derives canonical DIGIPIN; it rejects supplied user_id/digipin/unknown fields. Aliases normalized ASCII lowercase, 3..30 characters, reserved names rejected. Generic `ENROLLMENT_FAILED` covers expired/used/invalid invitation or duplicate alias; there is no availability oracle. Common statuses: 400 validation, 401 owner/recovery/admin denial, 403 Origin/CSRF, 404 cross-owner/missing record, 413 oversized, 415 non-JSON, 429 throttling, 503 storage/decryption failure. SQL/stack/request contents never returned/logged.

Rate windows persist across restarts: enrollment/recovery/admin ten attempts per socket-peer/action per ten minutes and global sixty/action; owner API 120/peer and 300 global per ten minutes. Failed attempts count. Reverse proxy users may share one peer quota; suitable only for the narrow beta. Raw addresses/IPs/tokens are not stored in audit/rate tables.

## Tests, backups, rollback

Executed on Node 24.20.0: independent PinID syntax checks and 24 tests passed; line coverage 98.91%. Separate root checks and 29 regression tests passed, with two preexisting audit TODOs. Tests include process restart, encrypted storage, replay/races and cross-owner denial. See [verification](docs/VERIFICATION.md) for local browser evidence and limits.

Run `npm ci --ignore-scripts`, `npm run check`, `npm test`, `npm run test:coverage`. Tests use real temporary SQLite and HTTP endpoints: expiration/replay, normalized uniqueness/parallel registration, finite input/confirmation, AES tampering/owner binding, cross-owner read/write/delete, session expiry/recovery/logout, wrong-key fail-closed, restart persistence, migrations and second-writer denial. No live deployment success is claimed.

Before backup, stop the single application cleanly; archive the entire persistent directory including SQLite sidecars to encrypted, access-controlled backup storage. Keep encryption keys separately. Restore only to isolated staging, verify recovery/decryption and apply deletion/revocation records before serving traffic. Do not copy a live SQLite file without a coordinated SQLite backup mechanism. Do not delete the persistent directory during rollback.

Rollback: stop Lite, set `PINID_LITE_ENABLED=false`, retain protected database/keys and restore the prior PinID release or leave Lite disabled. Keep the independent DIGIPIN service running. The Lite database is separate/additive; no existing production records are migrated. Re-enabling a restored old snapshot may revive credentials/records; reconcile deletion/revocation before doing so. No downgrade/destructive migration is supplied.
