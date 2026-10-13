# Automatic PostgreSQL schema migrations

Authorized separately by the user after PR-PG-01. This supersedes the earlier manual-only startup description; manual CLI remains available. It changes startup schema handling only, not SQLite-to-PostgreSQL data movement. No deployment, production credential changes or live migration were performed by this PR.

Add privately in Dokploy:

```dotenv
PINID_AUTO_MIGRATE=true
PINID_MIGRATION_DATABASE_URL=postgresql://migration_role:YOUR_SECRET@YOUR_PRIVATE_DB_HOST:5432/pincode_pinid
```

Keep PINID_DATABASE_URL as the restricted runtime-role URL. Both URLs must target the same host, port and database. Existing TLS/schema/pool configuration applies to both. The migration role needs schema creation/ownership rights; runtime remains restricted DML plus SELECT schema_migrations. No fallback promotes the runtime credential to a migration credential. Defaults remain manual/disabled unless opted in. Uppercase TRUE and surrounding whitespace are accepted.

On startup before binding HTTP: run the existing migration runner with the separate credential, acquire its transaction advisory lock, verify PostgreSQL version and all existing checksums, apply pending numbered migrations and record checksums atomically. Close the migration pool, then start the restricted runtime service after schema verification and encryption-canary validation. A concurrent startup waits on the lock or fails at the bounded statement timeout; retry after the active migrator finishes. Failures refuse startup without printing credentials, database exception contents or request data.

Current migration is additive CREATE-only. Repeat startup does not recreate tables or alter records. Changed/unknown applied migrations fail closed. Existing unversioned manually created tables are not overwritten; conflicting CREATE refuses and rolls back. Schema transaction commits before canary validation; a wrong encryption key still prevents serving data but does not undo an already successful schema migration. Keep original keys. Existing SQLite records are never copied, deleted or re-encrypted by this mechanism. Migration SQL changes still require review before releases; checksums do not prove a future migration is safe.

Tests extend the real PostgreSQL suite: concurrent app startup against a fresh disposable schema, repeat startup preserving invitation counts, checksum tampering refusing app startup, and configuration rejection for missing migration credential/different target. Existing rollback, encryption, owner authorization, outage and restart tests continue. CI tests PostgreSQL 17/18 and Node 22/24; exact executed results are reported on the PR. Generated test stores/logs/screenshots remain ignored. No production durability claim.

Rollback: set PINID_AUTO_MIGRATE=false or remove it and return to manual CLI; remove migration credentials from the application if no longer needed. Do not drop tables or delete migration history. Reverting app code does not revert committed schema; use a compatible release and a reviewed forward migration if needed. Stop writer first and keep database/key backups. GO for review after CI is green; NO-GO for automatic production execution until the operator confirms the target database, roles, backups and deployment approval.

Changed files: src/config.js, src/app.js, src/startup-error.js, .env.example, README.md, test/postgres.test.js, test/auto-migrate.test.js and this document. Existing runner/SQL/encryption implementation are unchanged.
