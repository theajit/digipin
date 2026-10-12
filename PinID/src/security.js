'use strict';
const crypto = require('node:crypto');
const { getDigiPin } = require('../../src/digipin');
class LiteError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const token = () => crypto.randomBytes(32).toString('base64url');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && crypto.timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
const reserved = new Set(['admin', 'api', 'auth', 'support', 'security', 'india-post', 'indiapost', 'government',
  'www', 'pincode', 'pinid', 'kitchenos', 'root', 'help', 'privacy', 'login', 'logout']);
function alias(value) {
  if (typeof value !== 'string') throw new LiteError('INVALID_ALIAS');
  const name = value.trim().toLowerCase();
  if (name.length < 3 || name.length > 30 || !/^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(name) || reserved.has(name)) {
    throw new LiteError('INVALID_ALIAS');
  }
  return `${name}@pincode`;
}
function fields(value, allowed, required = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) {
    throw new LiteError('INVALID_REQUEST');
  }
}
function location(value) {
  fields(value, ['label', 'latitude', 'longitude', 'confirmed', 'source', 'address'], ['latitude', 'longitude', 'confirmed']);
  const { latitude, longitude } = value;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < 2.5 || latitude > 38.5 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < 63.5 || longitude > 99.5) {
    throw new LiteError('INVALID_COORDINATES');
  }
  if (value.confirmed !== true) throw new LiteError('CONFIRMATION_REQUIRED');
  const label = value.label === undefined ? 'Home' : value.label;
  const address = value.address === undefined ? '' : value.address;
  if (typeof label !== 'string' || label.trim().length < 1 || label.length > 60 ||
      typeof address !== 'string' || address.length > 500 ||
      (value.source !== undefined && !['manual', 'gps'].includes(value.source))) throw new LiteError('INVALID_REQUEST');
  const digipin = getDigiPin(latitude, longitude);
  if (!/^[23456789CJKLMPFT]{10}$/.test(digipin)) throw new LiteError('ENCODING_FAILED', 503);
  return { label: label.trim(), latitude, longitude, digipin, address, source: value.source || 'manual' };
}
function encrypt(key, userId, locationId, payload) {
  const derived = crypto.hkdfSync('sha256', key, Buffer.from(userId), Buffer.from('pinid-lite-v1'), 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derived, iv);
  cipher.setAAD(Buffer.from(`${userId}:${locationId}:1`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), data: ciphertext.toString('base64url') });
}
function decrypt(key, userId, locationId, encrypted) {
  const payload = JSON.parse(encrypted);
  if (payload.v !== 1) throw new Error('Unsupported encrypted payload');
  const derived = crypto.hkdfSync('sha256', key, Buffer.from(userId), Buffer.from('pinid-lite-v1'), 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', derived, Buffer.from(payload.iv, 'base64url'));
  decipher.setAAD(Buffer.from(`${userId}:${locationId}:1`));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64url')), decipher.final()]).toString('utf8'));
}
module.exports = { LiteError, token, hash, validToken, same, alias, fields, location, encrypt, decrypt };
