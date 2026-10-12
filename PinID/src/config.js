'use strict';
const fs = require('node:fs');
const path = require('node:path');
function loadConfig(env = process.env) {
  if (env.PINID_LITE_ENABLED !== 'true') return null;
  function secret(name) {
    const value = env[name];
    if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value) || Buffer.from(value, 'base64url').length !== 32) {
      throw new Error(`PinID Lite requires a 32-byte base64url ${name}`);
    }
    return value;
  }
  const encryptionKey = secret('PINID_ENCRYPTION_KEY');
  const sessionSecret = secret('PINID_SESSION_SECRET');
  const adminSecret = secret('PINID_ADMIN_SECRET');
  if (new Set([encryptionKey, sessionSecret, adminSecret]).size !== 3) throw new Error('PinID Lite secrets must be distinct');
  const origin = new URL(env.PINID_ORIGIN || '');
  const local = ['localhost', '127.0.0.1'].includes(origin.hostname);
  const development = env.NODE_ENV !== 'production' && env.PINID_ALLOW_LOCAL_HTTP === 'true' && local;
  if (origin.origin !== env.PINID_ORIGIN || origin.username || origin.password ||
      (origin.protocol !== 'https:' && !(development && origin.protocol === 'http:'))) {
    throw new Error('PinID Lite requires an exact HTTPS PINID_ORIGIN (explicit local development exception only)');
  }
  if (env.PINID_SINGLE_WRITER !== 'true' || env.PINID_STORAGE_CONFIRMED !== 'true') {
    throw new Error('PinID Lite requires confirmed durable local storage and a single writer');
  }
  const directory = env.PINID_DATA_DIR;
  if (!directory || !path.isAbsolute(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error('PinID Lite requires an existing absolute PINID_DATA_DIR');
  }
  // Operator creates this on the mounted durable volume, never in the image.
  if (fs.readFileSync(path.join(directory, '.pinid-durable-volume'), 'utf8').trim() !== 'pinid-lite-local-volume-v1') {
    throw new Error('PinID Lite persistent-volume marker missing');
  }
  fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK);
  return { directory: fs.realpathSync(directory), origin: origin.origin, encryptionKey: Buffer.from(encryptionKey, 'base64url'),
    sessionSecret, adminSecret, secure: !development, sessionSeconds: 3600 };
}
module.exports = { loadConfig };
