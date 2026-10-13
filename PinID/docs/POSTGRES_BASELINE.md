# PR-PG-00: baseline and PostgreSQL review boundary

Audited 2026-10-13. Requested inspected baseline: `0772e9a34dcb5d5d243f4551193323b8b262b9fc`. Actual source: `7f9e847c50fc89a716cb208770aa074f9772efd8` on remote `pinid`. Review branch: `pinid-pg-00-ci-baseline`, targeting `pinid`, never main. No deployments, DNS changes, infrastructure provisioning, production credential changes or live data reads/writes.

## Scope and architecture decision

This PR changes only listener tests and this document. All runtime source, dependencies, migrations, UI and API behavior remain unchanged. Node 22 emits the SQLite experimental warning during module loading even when PinID is disabled. Tests remove only the exact known warning line and an optional immediately adjacent trace hint. Unknown warnings, standalone trace hints and application errors remain visible and fail exact stderr assertions. Production warning output is not suppressed. Unit assertions cover LF, CRLF and unknown warning/error preservation.

Latest source already added fail-fast=false to Node 22/24 CI and an unused PostgreSQL draft. Those are inherited source changes, not new functionality here. PostgreSQL 17 persistence is not implemented or enabled. PR-PG-01 and PR-PG-02 require separately reviewed implementations after this gate.

## Current schema and persistence

SQLite `node:sqlite` DatabaseSync; one synchronous repository, host-local WAL, foreign_keys=ON, synchronous=FULL, busy_timeout=5000, secure_delete=ON. An exclusive transaction in a separate writer-lock database prevents a second process; no multi-host safety claim. Transaction helper uses BEGIN IMMEDIATE/COMMIT/ROLLBACK. Migration 001 normalizes CRLF to LF, SHA-256 checksums the SQL, records schema_migrations(version,checksum), and rejects a changed applied checksum.

| Table | Current contract |
|---|---|
| users | UUID text PK; unique normalized alias including @pincode; nullable unique recovery_hash; active/deleted/suspended; created_at epoch milliseconds |
| invitations | UUID text PK; unique token_hash; expires_at and nullable consumed_at milliseconds |
| locations | UUID text PK; unique user_id FK (one location); encrypted envelope text; updated_at milliseconds |
| sessions | HMAC token_hash PK; user_id FK; expires_at milliseconds |
| rate_limits | HMAC bucket PK; count; expires_at milliseconds |
| settings | name PK; value, including encrypted startup key canary |
| audit_events | UUID text PK; nullable user_id text without FK; action; created_at milliseconds |
| schema_migrations | integer version PK; checksum text |

All eight tables, aliases/tombstones, UUIDs, hashes, session/rate buckets, audits and settings must be reconciled in a later offline migration. No real records have been inspected. Enrollment atomically inserts user/location, consumes invitation, creates session and audits; duplicate aliases roll back invitation consumption. Recovery transaction replaces sessions and audits. Location save/deletion and account deletion use transactions. Logout is a single delete. Invitation creation is transactional. Rate buckets are updated separately; preserve intended throttling while reviewing PostgreSQL atomicity under concurrency.

## API and privacy contract

Standalone UI `/`; API `/api` and compatibility `/pinid/api`; `/healthz` public status. Invitation creation requires admin header; enrollment requires one-use invite; recovery requires random recovery credential. Owner cookies authorize me/export, location CRUD, logout and account deletion. All state-changing API requests require exact Origin and JSON; owner changes also require session-bound X-PinID-CSRF. Secure deployments use __Host- cookie, Secure/HttpOnly/SameSite=Strict, Path=/, one-hour expiry. Recovery revokes previous sessions. No public alias/address resolution, OAuth, third-party sharing, payments or KitchenOS routes. Unknown owner IDs deny retrieval. Error responses use generic codes; unexpected API errors are 503 without stack/database contents. No request logging middleware.

Sensitive label/address/coordinates/DIGIPIN/source are encrypted together. Canonical DIGIPIN is ten approved characters. UUIDs and normalized aliases are not encrypted. Deleted identities retain aliases as tombstones; live location/session/recovery data is removed, audit/backup history may remain.

## Encryption compatibility: must remain byte-compatible

Master key: 32 random bytes, supplied externally as 43-character base64url. HKDF-SHA256: salt=owner UUID bytes (UTF-8), info=`pinid-lite-v1`, output=32 bytes. AES-256-GCM with random 12-byte nonce. AAD is UTF-8 `${userId}:${locationId}:1`. Envelope is JSON `{v:1,iv,tag,data}`, values base64url; plaintext is UTF-8 JSON. No decrypt/re-encrypt needed when copying ciphertext while preserving IDs. Startup settings canary uses userId=`configuration`, locationId=`key-check`, plaintext check=`pinid-lite-v1`; preserve it too. Wrong master key refuses startup. Recovery/invite verifiers use SHA-256; session/rate/CSRF derive HMAC-SHA256 with the unchanged session secret. Rotating session secret invalidates session/rate compatibility.

## Executed checks and evidence

Windows local execution: clean `npm ci --ignore-scripts`; `npm audit --json` reported zero known advisories (not proof of absence of vulnerabilities). Node 22.23.3 via official npm node runtime; Node 24.20.0 installed runtime. Each ran independent syntax checks and the complete five-file test suite with coverage. Both passed 30 tests, zero failures. Node 22 line coverage 98.70%; Node 24 97.99%; instrumentation differs by runtime. Raw results: ignored `PinID/test-data/pg00-node22.txt`, `pg00-node24.txt`, `pg00-audit.json`.

Executed failure cases include expired/replayed invite, alias rollback and HTTP races, nonfinite/unconfirmed location, ciphertext tampering and wrong-owner AAD, owner read/write/delete denial, recovery revocation and session expiry, CSRF/Origin/JSON rejection, wrong encryption key, missing storage/marker/secrets, second writer, rate persistence, actual separate-process restart/recovery, invalid hostname and occupied port. New filter tests explicitly preserve unknown stderr. Existing HTTP race tests use one SQLite writer; they do not establish PostgreSQL transaction isolation.

GitHub Ubuntu Node 22/24 CI must be checked on the PR commit before the gate is declared green. Local passing tests alone do not establish remote CI success. No UI changes; earlier local UI screenshots remain separate evidence. Browser access has previously been blocked by Edge; no new screenshot or production health claim follows from test output.

## Known defects and PostgreSQL design risks

- Inherited unused `migrations/postgres/001_initial.sql` is not a deployable migration runner: no checksum/version tracking, transactional runner, advisory lock, permission grants or repeat-migration path. Do not run it against production.
- Draft users.alias varchar(30) is incompatible with accepted 30-character usernames plus eight-character @pincode suffix (38 total). PR-PG-01 must correct this without reducing existing alias support.
- Draft timestamptz columns require explicit UTC conversion of epoch milliseconds; preserve millisecond precision, NULLs and relationships. Application/API timestamps must retain their existing numeric contract.
- All service/repository boundaries are currently synchronous. pg conversion requires awaited operations and explicit transaction clients; pool.query must not be mixed into a client transaction. Generic routes/health/shutdown failure handling must be reviewed under rejected promises and outages.
- Service startup wraps canary storage failures as key mismatch; SQLite error diagnostic is deliberately broad. These are documented existing behavior, unchanged by PR-PG-00.
- Invite recipient checks are out of band, not verified recipient binding. Recovery possession defines ownership. No key rotation/KMS envelope keys, audit retention maintenance or cryptographic deletion guarantee. Reverse proxy users share socket-peer quotas; trust proxy remains disabled.
- Existing tests do not establish PostgreSQL outage/pool-failure behavior, migration tampering against PostgreSQL, offline reconciliation or cutover rollback. Those are mandatory future tests, not passed checks here.

## Configuration and Dokploy baseline (no provisioning)

Use existing `.env.example` without secrets. Build path `/PinID`, Node >=22.18 (24 recommended), install `npm ci --ignore-scripts`, check `npm run check`, start `node server.js`. Dokploy listener `PINID_HOST=0.0.0.0`, PORT=5001, exact HTTPS PINID_ORIGIN. SQLite still requires an existing writable durable PINID_DATA_DIR, marker `pinid-lite-local-volume-v1`, confirmed storage and single-writer flags, three distinct external secrets. One writer pinned to local storage; stop old writer before replacement. No DATABASE_URL/pg dependency is consumed today. Do not remove this storage gate until a reviewed PostgreSQL adapter replaces it.

## Migration runbook boundaries and rollback

PR-PG-01 should add version/checksum-controlled PostgreSQL 17 migrations and a separately authenticated migration role; runtime role gets only required DML, no schema ownership/DDL. Keep SQLite regression support until replacement is accepted. Test disposable databases, outages and pool exhaustion; do not provision them here.

PR-PG-02 must default offline tool to dry-run, validate source schema/envelopes/relationships, use a fresh target, preserve IDs/ciphertext/hashes and canary, convert timestamps explicitly, and emit only aggregate redacted reconciliation. Reject partial/conflicting/repeated mismatched targets. Disable source writes during approved cutover; rehearse backup restore and rollback with synthetic data before manual approval. This is a future runbook, not an implemented or executed data migration. No automatic real-data movement is authorized.

PR-PG-00 rollback: revert its test/document commit, restoring previous test assertions. There are no schema, data, secrets or runtime changes; no database rollback is needed. Later cutover rollback must stop PostgreSQL writer and reconcile any post-cutover writes before returning to SQLite; never silently restore an older snapshot that revives deleted records or sessions. Keep encrypted backups and original keys separately protected.

Recommendation: GO for PR-PG-00 review once both remote CI jobs succeed; NO-GO for PostgreSQL deployment/cutover. Stop at this PR review boundary.
