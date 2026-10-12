'use strict';
const express = require('express');
const path = require('node:path');
const { Service } = require('./service');
const s = require('./security');
function createLite(config) {
  const service = new Service(config); const router = express.Router();
  const cookieName = config.secure ? '__Host-pinid_lite' : 'pinid_lite';
  function cookie(req) {
    const values = (req.headers.cookie || '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${cookieName}=`));
    return values.length === 1 ? values[0].slice(cookieName.length + 1) : '';
  }
  function setCookie(res, value, clear = false) {
    res.setHeader('Set-Cookie', `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : config.sessionSeconds}${config.secure ? '; Secure' : ''}`);
  }
  router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
    if (config.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
    if (Object.keys(req.query).length) return next(new s.LiteError('QUERY_NOT_ALLOWED'));
    next();
  });
  router.use('/api', (req, res, next) => {
    if (req.method === 'OPTIONS') return res.sendStatus(403);
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (req.headers.origin !== config.origin) return next(new s.LiteError('ORIGIN_REJECTED', 403));
      if (!req.is('application/json')) return next(new s.LiteError('JSON_REQUIRED', 415));
    }
    next();
  }, express.json({ limit: '8kb', strict: true }));
  function attempt(action) { return (req, res, next) => { try { service.rate(req.socket.remoteAddress || 'unknown', action); next(); } catch (e) { next(e); } }; }
  function owner(req, res, next) {
    try {
      const session = cookie(req); req.ownerId = service.owner(session); req.ownerSession = session;
      if (!['GET', 'HEAD'].includes(req.method) && !s.same(req.get('X-PinID-CSRF'), service.csrf(session))) throw new s.LiteError('CSRF_REJECTED', 403);
      next();
    } catch (e) { next(e); }
  }
  function result(res, value) {
    setCookie(res, value.session);
    res.json({ ...value.profile, csrf: service.csrf(value.session), ...(value.recovery_credential ? { recovery_credential: value.recovery_credential } : {}) });
  }
  router.get('/api/health', (req, res) => res.status(service.health() ? 200 : 503).json({ status: 'ok', pinid_lite: 'enabled' }));
  router.post('/api/invitations', attempt('admin'), (req, res) => {
    if (!s.same(req.get('X-PinID-Admin'), config.adminSecret)) throw new s.LiteError('UNAUTHORIZED', 401);
    s.fields(req.body, ['expires_in_seconds']); res.status(201).json(service.invite(req.body.expires_in_seconds));
  });
  router.post('/api/enroll', attempt('enroll'), (req, res) => result(res.status(201), service.enroll(req.body)));
  router.post('/api/recover', attempt('recover'), (req, res) => {
    s.fields(req.body, ['credential'], ['credential']); result(res, service.recover(req.body.credential));
  });
  router.use('/api', attempt('owner'), owner);
  router.get('/api/me', (req, res) => res.json({ ...service.profile(req.ownerId), csrf: service.csrf(req.ownerSession) }));
  router.get('/api/me/export', (req, res) => {
    res.set('Content-Disposition', 'attachment; filename="pinid-export.json"'); res.json(service.profile(req.ownerId));
  });
  router.delete('/api/me', (req, res) => {
    s.fields(req.body, ['credential'], ['credential']); service.deleteUser(req.ownerId, req.body.credential); setCookie(res, '', true); res.sendStatus(204);
  });
  router.post('/api/logout', (req, res) => { s.fields(req.body, []); service.logout(req.ownerSession); setCookie(res, '', true); res.sendStatus(204); });
  router.get('/api/locations/:id', (req, res) => res.json(service.getLocation(req.ownerId, req.params.id)));
  router.put('/api/location', (req, res) => res.json(service.saveLocation(req.ownerId, req.body)));
  router.put('/api/locations/:id', (req, res) => res.json(service.saveLocation(req.ownerId, req.body, req.params.id)));
  router.delete('/api/locations/:id', (req, res) => { s.fields(req.body, []); service.deleteLocation(req.ownerId, req.params.id); res.sendStatus(204); });
  router.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND' } }));
  router.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', dotfiles: 'deny', maxAge: 0 }));
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof s.LiteError ? error.status : error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 503;
    if (status === 429) res.set('Retry-After', '600');
    res.status(status).json({ error: { code: error instanceof s.LiteError ? error.code : status === 400 ? 'INVALID_JSON' : status === 413 ? 'BODY_TOO_LARGE' : 'SERVICE_UNAVAILABLE' } });
  });
  return { router, service };
}
module.exports = { createLite };
