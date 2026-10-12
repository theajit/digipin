'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const express = require('express');
const security = require('../src/pinid-lite/security');
const { Service } = require('../src/pinid-lite/service');
const { loadConfig } = require('../src/pinid-lite/config');
const { createLite } = require('../src/pinid-lite/routes');
const { spawnSync } = require('node:child_process');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pinid-lite-test-'));
  fs.writeFileSync(path.join(directory, '.pinid-durable-volume'), 'pinid-lite-local-volume-v1');
  const env = { NODE_ENV: 'test', PINID_LITE_ENABLED: 'true', PINID_DATA_DIR: directory,
    PINID_SINGLE_WRITER: 'true', PINID_STORAGE_CONFIRMED: 'true', PINID_ORIGIN: 'https://pinid.test',
    PINID_ENCRYPTION_KEY: security.token(), PINID_SESSION_SECRET: security.token(), PINID_ADMIN_SECRET: security.token() };
  const config = loadConfig(env);
  // Only files in the exclusively created test temp directory are cleaned up.
  // Retain this isolated temporary fixture for diagnosis; service hooks close DBs.
  // Windows cannot remove SQLite files before later registered close hooks run.
  return { config, env };
}
const loc = { latitude: 12.972579, longitude: 77.592015, confirmed: true, label: 'Private home', address: 'Synthetic unit 7' };
function enroll(service, username = 'ajit') { return service.enroll({ invitation: service.invite().invitation, username, location: loc }); }
test('records and recovery survive separate Node process restarts', t => {
  const { env } = fixture(t);
  const bootstrap = "const c=require('./src/pinid-lite/config').loadConfig();const s=new(require('./src/pinid-lite/service').Service)(c);";
  const first = spawnSync(process.execPath, ['-e', bootstrap + "const r=s.enroll({invitation:s.invite().invitation,username:'restart-owner',location:{latitude:13,longitude:77,confirmed:true}});process.stdout.write(JSON.stringify({credential:r.recovery_credential,id:r.profile.id}));s.close();"], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, ...env }, encoding: 'utf8', timeout: 10000 });
  assert.equal(first.status, 0, first.stderr);
  const enrolled = JSON.parse(first.stdout);
  const second = spawnSync(process.execPath, ['-e', bootstrap + "const r=s.recover(process.env.TEST_RECOVERY);process.stdout.write(JSON.stringify({id:r.profile.id,digipin:r.profile.location.digipin}));s.close();"], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, ...env, TEST_RECOVERY: enrolled.credential }, encoding: 'utf8', timeout: 10000 });
  assert.equal(second.status, 0, second.stderr);
  const restored = JSON.parse(second.stdout); assert.equal(restored.id, enrolled.id); assert.match(restored.digipin, /^[23456789CJKLMPFT]{10}$/);
});
test('fail-closed configuration and durable storage requirements', t => {
  const { env } = fixture(t);
  assert.equal(loadConfig({}), null);
  for (const missing of ['PINID_ENCRYPTION_KEY', 'PINID_SESSION_SECRET', 'PINID_ADMIN_SECRET', 'PINID_DATA_DIR', 'PINID_STORAGE_CONFIRMED', 'PINID_SINGLE_WRITER', 'PINID_ORIGIN']) {
    assert.throws(() => loadConfig({ ...env, [missing]: '' }));
  }
  assert.throws(() => loadConfig({ ...env, NODE_ENV: 'production', PINID_ORIGIN: 'http://localhost:5000', PINID_ALLOW_LOCAL_HTTP: 'true' }));
  assert.throws(() => loadConfig({ ...env, PINID_ADMIN_SECRET: env.PINID_SESSION_SECRET }));
  fs.unlinkSync(path.join(env.PINID_DATA_DIR, '.pinid-durable-volume'));
  assert.throws(() => loadConfig(env));
});
test('authenticated encryption round trip, tamper and owner binding', () => {
  const key = Buffer.from(security.token(), 'base64url');
  const encrypted = security.encrypt(key, 'user-a', 'location-a', loc);
  assert.deepEqual(security.decrypt(key, 'user-a', 'location-a', encrypted), loc);
  assert.ok(!encrypted.includes('Private home'));
  assert.throws(() => security.decrypt(key, 'user-b', 'location-a', encrypted));
  assert.throws(() => security.decrypt(key, 'user-a', 'location-b', encrypted));
  const parsed = JSON.parse(encrypted); const bytes = Buffer.from(parsed.data, 'base64url'); bytes[0] ^= 1; parsed.data = bytes.toString('base64url');
  assert.throws(() => security.decrypt(key, 'user-a', 'location-a', JSON.stringify(parsed)));
});
test('finite coordinates, confirmation, normalization and reserved aliases', () => {
  assert.equal(security.alias(' AjIt '), 'ajit@pincode');
  for (const value of ['admin', 'indiapost', 'aa', 'a@pincode', 'аjit', 'ajit.', '_ajit']) assert.throws(() => security.alias(value));
  for (const value of [NaN, Infinity, -Infinity, null, '', '12.9', 2.4, 38.6]) assert.throws(() => security.location({ ...loc, latitude: value }));
  for (const value of [NaN, Infinity, '77', 63.4, 99.6]) assert.throws(() => security.location({ ...loc, longitude: value }));
  assert.throws(() => security.location({ ...loc, confirmed: false }));
  assert.throws(() => security.location({ ...loc, user_id: 'someone-else' }));
  assert.equal(security.location(loc).digipin, '4P3JK83M28');
});
test('invitations expire and redeem once; alias failures roll back consumption', t => {
  const { config } = fixture(t); let now = Date.now(); const service = new Service(config, () => now); t.after(() => service.close());
  const expired = service.invite(60); now += 60001;
  assert.throws(() => service.enroll({ invitation: expired.invitation, username: 'expired', location: loc }), /ENROLLMENT_FAILED/);
  const invite = service.invite(); const first = service.enroll({ invitation: invite.invitation, username: 'Ajit', location: loc });
  assert.equal(first.profile.alias, 'ajit@pincode'); assert.equal(first.profile.location.digipin, '4P3JK83M28');
  assert.throws(() => service.enroll({ invitation: invite.invitation, username: 'again', location: loc }), /ENROLLMENT_FAILED/);
  const collision = service.invite();
  assert.throws(() => service.enroll({ invitation: collision.invitation, username: 'AJIT', location: loc }), /ENROLLMENT_FAILED/);
  assert.equal(service.enroll({ invitation: collision.invitation, username: 'another', location: loc }).profile.alias, 'another@pincode');
  assert.throws(() => service.enroll({ invitation: security.token(), username: 'unknown', location: loc }), /ENROLLMENT_FAILED/);
});
test('persistence, migration reapplication, wrong-key refusal and single writer', t => {
  const { config } = fixture(t); let service = new Service(config); const first = enroll(service);
  assert.throws(() => new Service(config), /locked/);
  const plaintext = service.repo.get('SELECT encrypted FROM locations').encrypted;
  assert.ok(!plaintext.includes('4P3JK83M28')); assert.ok(!plaintext.includes('12.972579'));
  assert.equal(service.repo.get('SELECT recovery_hash FROM users').recovery_hash, security.hash(first.recovery_credential));
  assert.equal(service.repo.get('SELECT token_hash FROM invitations').token_hash.length, 64);
  service.close();
  assert.throws(() => new Service({ ...config, encryptionKey: Buffer.from(security.token(), 'base64url') }), /key does not match/);
  service = new Service(config); t.after(() => service.close());
  assert.equal(service.owner(first.session), first.profile.id);
  assert.equal(service.recover(first.recovery_credential).profile.location.digipin, '4P3JK83M28');
  assert.equal(service.repo.get('SELECT COUNT(*) AS n FROM schema_migrations').n, 1);
});
test('recovery rotates sessions; expiry, deletion and cross-owner operations deny', t => {
  const { config } = fixture(t); let now = Date.now(); const service = new Service(config, () => now); t.after(() => service.close());
  const a = enroll(service, 'owner-a'); const b = enroll(service, 'owner-b');
  assert.throws(() => service.getLocation(a.profile.id, b.profile.location.id), /NOT_FOUND/);
  assert.throws(() => service.saveLocation(a.profile.id, loc, b.profile.location.id), /NOT_FOUND/);
  assert.throws(() => service.deleteLocation(a.profile.id, b.profile.location.id), /NOT_FOUND/);
  assert.throws(() => service.deleteUser(a.profile.id, b.recovery_credential), /RECOVERY_FAILED/);
  assert.throws(() => service.recover(security.token()), /RECOVERY_FAILED/);
  const fresh = service.recover(a.recovery_credential); assert.throws(() => service.owner(a.session), /UNAUTHORIZED/);
  assert.equal(service.owner(fresh.session), a.profile.id); now += 3600001;
  assert.throws(() => service.owner(fresh.session), /UNAUTHORIZED/);
  service.deleteUser(a.profile.id, a.recovery_credential);
  assert.throws(() => service.recover(a.recovery_credential), /RECOVERY_FAILED/);
  assert.throws(() => enroll(service, 'owner-a'), /ENROLLMENT_FAILED/);
  assert.equal(service.profile(b.profile.id).location.digipin, '4P3JK83M28');
});
test('rate limits persist across reopening', t => {
  const { config } = fixture(t); let service = new Service(config);
  for (let i = 0; i < 10; i++) service.rate('test-ip', 'recover');
  assert.throws(() => service.rate('test-ip', 'recover'), /RATE_LIMITED/); service.close();
  service = new Service(config); t.after(() => service.close()); assert.throws(() => service.rate('test-ip', 'recover'), /RATE_LIMITED/);
});
test('HTTP enrollment/recovery privacy, alias/replay races, CSRF and BOLA', async t => {
  const { config } = fixture(t); const lite = createLite(config); const app = express(); app.use('/pinid', lite.router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); lite.service.close(); });
  const base = `http://127.0.0.1:${server.address().port}/pinid`;
  async function request(route, method = 'GET', body, owner, extra = {}) {
    const response = await fetch(`${base}/api${route}`, { method, headers: { Origin: config.origin, 'Content-Type': 'application/json',
      ...(owner ? { Cookie: owner.cookie, 'X-PinID-CSRF': owner.csrf } : {}), ...extra },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const value = response.status === 204 ? null : await response.json();
    return { status: response.status, value, cookie: response.headers.get('set-cookie')?.split(';')[0], csrf: value?.csrf, response };
  }
  for (const route of ['/me', '/me/export', '/locations/unknown']) assert.equal((await request(route)).status, 401);
  const bad = await request('/invitations', 'POST', {}); assert.equal(bad.status, 401);
  const createInvite = async () => (await request('/invitations', 'POST', {}, null, { 'X-PinID-Admin': config.adminSecret })).value.invitation;
  const invites = [await createInvite(), await createInvite()];
  const raced = await Promise.all(invites.map(invitation => request('/enroll', 'POST', { invitation, username: 'race-owner', location: loc })));
  assert.deepEqual(raced.map(r => r.status).sort(), [201, 400]); const owner = raced.find(r => r.status === 201);
  assert.match(owner.response.headers.get('set-cookie'), /HttpOnly/); assert.match(owner.response.headers.get('set-cookie'), /Secure/);
  assert.match(owner.response.headers.get('set-cookie'), /SameSite=Strict/); assert.equal(owner.response.headers.get('cache-control'), 'no-store');
  assert.equal(owner.response.headers.get('access-control-allow-origin'), null);
  const invitation = await createInvite();
  const replayRace = await Promise.all(['person-one', 'person-two'].map(username => request('/enroll', 'POST', { invitation, username, location: loc })));
  assert.deepEqual(replayRace.map(r => r.status).sort(), [201, 400]); const other = replayRace.find(r => r.status === 201);
  assert.equal((await request(`/locations/${other.value.location.id}`, 'GET', undefined, owner)).status, 404);
  assert.equal((await request(`/locations/${other.value.location.id}`, 'PUT', loc, owner)).status, 404);
  assert.equal((await request(`/locations/${other.value.location.id}`, 'DELETE', {}, owner)).status, 404);
  assert.equal((await request('/location', 'PUT', loc, owner, { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await request('/location', 'PUT', loc, owner, { 'X-PinID-CSRF': 'wrong' })).status, 403);
  assert.equal((await request('/location', 'PUT', { ...loc, latitude: null }, owner)).status, 400);
  assert.equal((await request('/me?credential=forbidden', 'GET', undefined, owner)).status, 400);
  assert.equal((await request('/me', 'GET', undefined, owner)).value.alias, 'race-owner@pincode');
  const recovered = await request('/recover', 'POST', { credential: owner.value.recovery_credential });
  assert.equal(recovered.status, 200); assert.equal(recovered.value.recovery_credential, undefined);
  assert.equal((await request('/me', 'GET', undefined, owner)).status, 401);
  assert.equal((await request('/logout', 'POST', {}, recovered)).status, 204);
  assert.equal((await request('/me', 'GET', undefined, recovered)).status, 401);
  const publicPage = await fetch(base + '/'); assert.equal(publicPage.status, 200);
  assert.ok(!(await publicPage.text()).includes(owner.value.alias));
  const malformed = await fetch(base + '/api/recover', { method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400); assert.deepEqual(await malformed.json(), { error: { code: 'INVALID_JSON' } });
});
