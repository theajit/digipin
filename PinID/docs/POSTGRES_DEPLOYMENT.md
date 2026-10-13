# PostgreSQL v1 implementation and Dokploy review

PR-PG-01 targets `pinid` from `pinid-pg-01-postgres`. No main/original DIGIPIN service, production credentials/data, DNS or deployments are changed. No real-data migration tool is included. Existing SQLite remains default and tested.

## Architecture and decisions

`postgres-config.js` validates explicit connection/TLS/schema/version/pool settings. `postgres-repository.js` implements pg pooling, parameterized statements and version/checksum verification. Transactions use one checked-out client tracked by AsyncLocalStorage; COMMIT or ROLLBACK precedes release, and a failed rollback destroys the connection. No transaction uses pool.query. Idle pool errors have a handler without error-content logging; subsequent health/data queries report failure. Pool acquisition and SQL execution are bounded. Fixed search_path is pinid,pg_catalog; runtime must not own or create objects in that schema.

`postgres-service.js` preserves the existing service contract with asynchronous methods. The synchronous SQLite service/repository stays available for compatibility until PostgreSQL is accepted. This temporary duplication needs joint regression coverage and must not become two diverging products. HTTP boundaries await either service; Express 5 catches rejected promises with the existing sanitized error handler. `createAppAsync` verifies schema and encryption canary before listening. Runtime startup never creates PostgreSQL tables; only the explicit migration CLI does DDL.

Enrollment locks the selected invitation, rechecks expiry after the lock, inserts user/location, consumes invite, creates session and audits in one transaction; UNIQUE failures return the existing generic enrollment error. Recovery/session replacement locks the active user to serialize concurrent recovery and deletion. Location saves lock the active user before upsert to prevent resurrection after account deletion. Delete removes location/sessions and tombstones the alias atomically. Invitation/audit creation is atomic; logout is a single atomic DELETE. Rate bucket UPSERTs enforce concurrent ceilings atomically, with global then peer quotas retaining the existing separate-bucket behavior; expired buckets are pruned.

Schema `migrations/postgres/001_initial.sql` creates seven private tables, UUID keys, foreign keys, unique alias/location/token constraints and expiry indexes; the runner creates schema_migrations(version,checksum). Alias capacity is 38 including @pincode. Audit user_id intentionally has no FK to retain existing audit semantics. Timestamps are bigint UTC epoch milliseconds, preserving numeric API/session comparisons without local-time conversion or pg bigint precision loss; repository rejects unsafe integer timestamps. A future offline importer must preserve this contract, not blindly convert these columns to timestamptz.

Encryption is unchanged: existing security.js AES-256-GCM, HKDF-SHA256 info pinid-lite-v1, owner UUID salt, AAD `${userId}:${locationId}:1`, original JSON/base64url envelope, 12-byte nonce, unchanged canary. UUIDs, encrypted text, SHA-256 recovery/invitation verifiers, HMAC sessions/rate buckets, audits and alias tombstones retain their meaning. No OIDC, Redis, public lookup, multiple locations, payments or sharing added.

## Environment (placeholders only)

```dotenv
NODE_ENV=production
PINID_LITE_ENABLED=true
PINID_ORIGIN=https://name.pincode.cafe
PORT=5001
PINID_HOST=0.0.0.0
PINID_STORAGE_BACKEND=postgres
PINID_STORAGE_VERSION=postgres-v1
PINID_DB_SCHEMA=pinid
PINID_DB_POOL_MAX=5
PINID_DB_CONNECTION_TIMEOUT_MS=5000
PINID_DATABASE_URL=postgresql://pinid_runtime:YOUR_SECRET@PRIVATE_HOST:5432/pincode_pinid
PINID_ENCRYPTION_KEY=YOUR_43_CHARACTER_BASE64URL_SECRET
PINID_SESSION_SECRET=ANOTHER_DISTINCT_43_CHARACTER_SECRET
PINID_ADMIN_SECRET=A_THIRD_DISTINCT_43_CHARACTER_SECRET
PINID_PG_TLS=verify-full
```

PostgreSQL mode ignores PINID_DATA_DIR and SQLite marker/writer assertions. Do not disable SQLite gates while still using sqlite. Missing backend defaults to sqlite. Only pinid schema and postgres-v1 version are accepted. Pool max 1..50, connection timeout 100..30000 ms, statement timeout 5000 ms. Connection URLs with query/hash options are rejected so URL ssl options cannot silently override TLS. Default TLS verifies certificates; `PINID_PG_TLS=disable` is an explicit option only for a trusted isolated private Dokploy network with no TLS. Never expose that database port publicly. Do not paste connection URLs/secrets in logs or screenshots.

## Explicit migration and least privilege

For an empty PostgreSQL 17 database, an operator provides a separate migration-role URL as PINID_MIGRATION_DATABASE_URL in a private terminal. That role needs schema creation/ownership privileges; the runtime role needs CONNECT to the database, USAGE on schema pinid, SELECT/INSERT/UPDATE/DELETE on application tables, SELECT only on schema_migrations, no schema CREATE or ownership. Roles/database must be provisioned manually outside this PR. Do not leave migration credentials in the application environment.

Run inside PinID: `npm ci --ignore-scripts`, then `npm run migrate:postgres`. Runner acquires a transaction advisory lock, validates server >=17, rejects unknown/changed applied versions, creates missing tables and records normalized-LF SHA-256 SQL checksums in one transaction. Repeat execution is safe. Changing an applied migration fails closed; add numbered migration files rather than editing applied SQL. The inherited draft was unused by runtime and is now the reviewed v1 schema. If someone manually ran the old draft without schema_migrations, this runner refuses on existing table conflicts: do not drop records; stop and review that database separately.

After migration, grant (using the operator's own existing role names):

```sql
GRANT USAGE ON SCHEMA pinid TO pinid_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pinid TO pinid_runtime;
REVOKE INSERT, UPDATE, DELETE ON pinid.schema_migrations FROM pinid_runtime;
```

Ensure runtime is not the migration role or a superuser and has no CREATE on schema pinid. No sequence privileges needed (UUIDs). Review default privileges when adding future tables. For PostgreSQL itself, disable statement/parameter/body logging of sensitive traffic and restrict server logs/backups: log_parameter_max_length=0, log_parameter_max_length_on_error=0; do not enable log_statement for production address operations. Application logging never prints SQL, connection URLs or errors.

## Dokploy instructions (not executed on production)

PostgreSQL 18 on the user's server is supported. CI tests PostgreSQL 17 and 18 with Node 22 and 24; local synthetic tests run on PostgreSQL 18. No existing server/database is modified by these checks.

Deploy the reviewed branch as a separate application with build path /PinID, Node >=22.18 (24 recommended), install npm ci --ignore-scripts, check npm run check, start node server.js. Use the existing domain routing to port 5001; this PR does not modify it. Set the above env values and privately supply real credentials. No SQLite mount/marker is needed in postgres mode; durable PostgreSQL storage and backups remain mandatory. Run migrations manually before starting the runtime. No Dockerfile or application Docker deployment is added; CI alone uses ephemeral PostgreSQL 17 service containers.

Check `/healthz` and `/api/health`, then privately generate an invitation with npm run invite. Test a synthetic user's enrollment, recovery, update/export/deletion and restart on isolated staging. Health is readiness only, not proof of backup/durability. Keep beta at one app replica until distributed quotas/proxy behavior and production load are reviewed. Production retention/contact/privacy obligations from the baseline still apply.

## API documentation and errors

The API paths/bodies/cookie/CSRF contract in README.md is unchanged. Both health routes now await the backend and return 503 on database failure. Generic SERVICE_UNAVAILABLE wraps unrecognized database errors; invitation alias/replay collisions retain ENROLLMENT_FAILED. No database address resolver exists. Owner-only location/export responses retain numeric timestamps and ten-character DIGIPIN. PostgreSQL startup rejects missing/checksum-mismatched migrations and wrong encryption key. Startup hints are allowlisted; unexpected errors remain generic.

## Test commands and evidence boundaries

Changed-file inventory: `.github/workflows/pinid-baseline.yml`; PinID `.env.example`, README.md, package.json/lockfile, server.js; src app.js/config.js/routes.js/startup-error.js; new src postgres-config.js/postgres-repository.js/postgres-service.js; scripts/migrate-postgres.js; migrations/postgres/001_initial.sql; test/postgres.test.js; this document. Existing SQLite engine/service/repository, encryption implementation and UI are unchanged.

Executed local verification on 2026-10-13: Node 24.20.0 full suite passed 43 tests, zero failures against isolated PostgreSQL 18. Clean pg installation and npm audit reported zero known advisories. Initial pool-saturation test used 100 ms and failed during connection establishment on Windows; corrected to 1000 ms and rerun successfully. This did not change production timeout defaults. Node 22 and PostgreSQL 17 CI results are reported separately on the PR after actual execution.

SQLite suite: npm test with no PINID_TEST_DATABASE_URL (PostgreSQL integration is explicitly skipped). PostgreSQL integration requires a disposable loopback database whose name ends in _test, plus PINID_PG_TEST_ALLOW_RESET=true. It drops only that explicit test schema and uses a synthetic limited runtime role. NEVER set these variables to a live database. CI runs Node 22/24 with disposable PostgreSQL 17 and full SQLite/security regression. Local integration uses installed PostgreSQL 18; that is additional compatibility evidence, not a PostgreSQL 17 claim.

Tests cover clean/repeat migrations, checksums, DDL denial, concurrent alias/invite races, rollback after partial enrollment, owner CRUD/CSRF/recovery/logout/export/deletion, session expiry, AES envelope compatibility/tampering/wrong key, rate races/persistence, schema unavailability, denied database connections, pool saturation, unreachable port, real server process restart/recovery and absence of credential/coordinate/plaintext application logs. Logs and screenshots remain ignored under test-data. Exact executed results and CI links are reported on the PR; planned checks are not passed results.

## Data migration boundary and rollback

This is greenfield PostgreSQL deployment support, NOT SQLite-to-PostgreSQL data transfer. Existing users must stay on SQLite until PR-PG-02's separately reviewed offline, dry-run-first tool and manual cutover approval. No automatic startup conversion occurs. Preserve source SQLite database and original encryption/session secrets; switching backend does not move records.

Before any approved release, back up the full source store and keys separately. Revert app code/config only after stopping the writer. For an empty greenfield PostgreSQL beta, stop it and restore the prior SQLite backend/config and its original local volume; keep PostgreSQL data protected. Once new PostgreSQL records exist, reverting to SQLite will not contain them: stop and reconcile via a reviewed reverse migration before serving users. Do not delete/drop tables or keys as rollback. There is no destructive down migration. Migration failure rolls its transaction back; checksum failure requires restoring correct migration source, not bypassing validation.

Remaining risks: temporary dual service implementations, no KMS/key rotation, possession-based recovery, out-of-band invite recipient checks, audit/backup retention unresolved, shared reverse-proxy rate buckets, independent global/peer rate updates, stale owner requests already in flight during revocation, and database administrator access to aliases/ciphertext/metadata. TLS and durable PostgreSQL/backup posture remain operator responsibilities. No guarantee of erasing third-party copies (none authorized in this MVP).

GO/NO-GO: GO for PR review only when executed PostgreSQL 17/Node 22+24 CI and SQLite jobs pass. NO-GO for real-data cutover or production deployment without manual review, durable database/TLS/least-privilege verification and staged restore rehearsal. Stop at PR review; no merge/deploy or PR-PG-02 implementation is authorized here.
