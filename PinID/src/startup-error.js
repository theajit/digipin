'use strict';
// Allowlisted operator hints only. Never print arbitrary exception text/paths.
const hints = new Map([
  ['PinID Resend configuration invalid','Email sending requires RESEND_API_KEY and a verified sender address in PINID_EMAIL_FROM.'],
  ['Migration database target mismatch','Migration and runtime credentials must target the same PostgreSQL host, port and database.'],
  ['PostgreSQL migration credential required','Automatic schema migration requires PINID_MIGRATION_DATABASE_URL for a separate migration role.'],
  ['PostgreSQL configuration invalid','PostgreSQL configuration invalid. Check database URL, TLS, pinid schema, postgres-v1 version, pool and timeout settings; do not log credentials.'],
  ['PostgreSQL migrations invalid','PostgreSQL migrations are missing or their checksums differ. Run the reviewed migration CLI with a separate migration role; preserve data.'],
  ['PostgreSQL 17 required','PostgreSQL server version must be 17 or newer.'],
  ...['PINID_ENCRYPTION_KEY','PINID_SESSION_SECRET','PINID_ADMIN_SECRET'].map(name =>
    [`PinID Lite requires a 32-byte base64url ${name}`, `${name}: set a distinct 43-character base64url secret generated from 32 random bytes.`]),
  ['PinID Lite secrets must be distinct','Secrets must be three different values.'],
  ['PinID Lite requires an exact HTTPS PINID_ORIGIN (explicit local development exception only)','PINID_ORIGIN: use the exact HTTPS origin, without a trailing slash or path.'],
  ['PinID Lite requires confirmed durable local storage and a single writer','Confirm durable storage and one writer; set PINID_STORAGE_CONFIRMED=true and PINID_SINGLE_WRITER=true only after verification.'],
  ['PinID Lite requires an existing absolute PINID_DATA_DIR','PINID_DATA_DIR: mount an existing writable absolute directory.'],
  ['PinID Lite persistent-volume marker missing','Storage marker: create .pinid-durable-volume on the mounted data directory containing pinid-lite-local-volume-v1.'],
  ['PinID Lite encryption key does not match database','Encryption key does not match the existing database. Restore the original key; do not delete the database or generate a replacement key.'],
  ['PinID Lite migration checksum mismatch','Database migration checksum mismatch. Restore the matching migration/release; preserve the database.']
]);
function startupHint(error) {
  if(hints.has(error?.message)) return hints.get(error.message);
  if(error?.code==='ERR_INVALID_URL') return 'PINID_ORIGIN: set the exact HTTPS origin, such as https://name.pincode.cafe.';
  if(['ENOENT','ENOTDIR'].includes(error?.code)) return 'Storage directory or .pinid-durable-volume marker is missing. Check the persistent mount and PINID_DATA_DIR.';
  if(['EACCES','EPERM','EROFS'].includes(error?.code)) return 'Storage is not writable by the application user. Check mount permissions and read-only settings.';
  if(error?.code==='ERR_SQLITE_ERROR') return 'SQLite startup failed. Check writable local storage and stop any other writer before restarting; preserve the database and keys.';
  return 'Check storage, keys, origin and configuration. No exception details are logged.';
}
module.exports={startupHint};
