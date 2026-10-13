'use strict';
const express = require('express');
const path = require('node:path');
const { Service } = require('./service');
const s = require('./security');
function createLite(config, providedService) {
  const service = providedService || new Service(config); const router = express.Router();
  const resolverOrigin=config.resolverOrigin||'https://digipin.pincode.cafe';
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
    if(req.path==='/resolve'&&req.headers.origin===resolverOrigin) {
      res.set('Access-Control-Allow-Origin',resolverOrigin).set('Vary','Origin');
      if(req.method==='OPTIONS')return res.set('Access-Control-Allow-Methods','POST').set('Access-Control-Allow-Headers','Content-Type').sendStatus(204);
    }
    if (req.method === 'OPTIONS') return res.sendStatus(403);
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (req.headers.origin !== config.origin && !(req.path==='/resolve'&&req.headers.origin===resolverOrigin)) return next(new s.LiteError('ORIGIN_REJECTED', 403));
      if (!req.is('application/json')) return next(new s.LiteError('JSON_REQUIRED', 415));
    }
    next();
  }, express.json({ limit: '8kb', strict: true }));
  function attempt(action) { return async (req, res, next) => { try { await service.rate(req.socket.remoteAddress || 'unknown', action); next(); } catch (e) { next(e); } }; }
  async function owner(req, res, next) {
    try {
      const session = cookie(req); req.ownerId = await service.owner(session); req.ownerSession = session;
      if (!['GET', 'HEAD'].includes(req.method) && !s.same(req.get('X-PinID-CSRF'), service.csrf(session))) throw new s.LiteError('CSRF_REJECTED', 403);
      next();
    } catch (e) { next(e); }
  }
  function result(res, value) {
    setCookie(res, value.session);
    res.json({ ...value.profile, csrf: service.csrf(value.session), ...(value.recovery_credential ? { recovery_credential: value.recovery_credential } : {}) });
  }
  const adminCookieName=config.secure?'__Host-pinid_admin':'pinid_admin';
  const adminCookie=req=>{const parts=(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(adminCookieName+'='));return parts.length===1?parts[0].slice(adminCookieName.length+1):'';};
  const setAdminCookie=(res,session,clear=false)=>res.set('Set-Cookie',`${adminCookieName}=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear?0:3600}${config.secure?'; Secure':''}`);
  const admin=async(req,res,next)=>{try{const session=adminCookie(req);await service.adminCheck(session);req.adminSession=session;if(req.method!=='GET'&&!s.same(req.get('X-PinID-CSRF'),service.csrf(session)))throw new s.LiteError('CSRF_REJECTED',403);next();}catch(error){next(error);}};
  router.post('/api/interest',attempt('interest'),async(req,res)=>res.status(202).json(await service.interest(req.body)));
  router.post('/api/resolve',attempt('resolve'),async(req,res)=>res.json(await service.resolve(req.body)));
  router.post('/api/admin/login',attempt('admin'),async(req,res)=>{const session=await service.adminLogin(req.body);setAdminCookie(res,session);res.json({csrf:service.csrf(session)});});
  router.get('/api/admin/me',attempt('owner'),admin,(req,res)=>res.json({csrf:service.csrf(req.adminSession)}));
  router.post('/api/admin/queue',attempt('owner'),admin,async(req,res)=>{s.fields(req.body,['before']);res.json(await service.queue(req.body.before));});
  router.post('/api/admin/invitations',attempt('owner'),admin,async(req,res)=>{s.fields(req.body,[]);res.status(201).json(await service.invite());});
  router.post('/api/admin/requests/:id',attempt('owner'),admin,async(req,res)=>res.json(await service.decide(req.params.id,req.body)));
  router.delete('/api/admin/requests/:id',attempt('owner'),admin,async(req,res)=>{s.fields(req.body,[]);await service.removeRequest(req.params.id);res.sendStatus(204);});
  router.post('/api/admin/logout',admin,async(req,res)=>{s.fields(req.body,[]);await service.adminLogout(req.adminSession);setAdminCookie(res,'',true);res.sendStatus(204);});
  router.get('/api/health', async (req, res) => {
    try {res.status(await service.health() ? 200 : 503).json({ status: 'ok', pinid_lite: 'enabled' });}
    catch {res.status(503).json({status:'unavailable'});}
  });
  router.post('/api/invitations', attempt('admin'), async (req, res) => {
    if (!s.same(req.get('X-PinID-Admin'), config.adminSecret)) throw new s.LiteError('UNAUTHORIZED', 401);
    s.fields(req.body, ['expires_in_seconds']); res.status(201).json(await service.invite(req.body.expires_in_seconds));
  });
  router.post('/api/enroll', attempt('enroll'), async (req, res) => result(res.status(201), await service.enroll(req.body)));
  router.post('/api/recover', attempt('recover'), async (req, res) => {
    s.fields(req.body, ['credential'], ['credential']); result(res, await service.recover(req.body.credential));
  });
  router.use('/api', attempt('owner'), owner);
  router.get('/api/sharing',async(req,res)=>res.json(await service.sharingStatus(req.ownerId)));
  router.put('/api/sharing',async(req,res)=>res.json(await service.sharing(req.ownerId,req.body)));
  router.get('/api/me', async (req, res) => res.json({ ...await service.profile(req.ownerId), csrf: service.csrf(req.ownerSession) }));
  router.get('/api/me/export', async (req, res) => {
    res.set('Content-Disposition', 'attachment; filename="pinid-export.json"'); res.json(await service.profile(req.ownerId));
  });
  router.delete('/api/me', async (req, res) => {
    s.fields(req.body, ['credential'], ['credential']); await service.deleteUser(req.ownerId, req.body.credential); setCookie(res, '', true); res.sendStatus(204);
  });
  router.post('/api/logout', async (req, res) => { s.fields(req.body, []); await service.logout(req.ownerSession); setCookie(res, '', true); res.sendStatus(204); });
  router.get('/api/locations/:id', async (req, res) => res.json(await service.getLocation(req.ownerId, req.params.id)));
  router.put('/api/location', async (req, res) => res.json(await service.saveLocation(req.ownerId, req.body)));
  router.put('/api/locations/:id', async (req, res) => res.json(await service.saveLocation(req.ownerId, req.body, req.params.id)));
  router.delete('/api/locations/:id', async (req, res) => { s.fields(req.body, []); await service.deleteLocation(req.ownerId, req.params.id); res.sendStatus(204); });
  router.use('/api', async (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND' } }));
  router.use(express.static(path.join(__dirname, '../public'), { index: 'index.html', dotfiles: 'deny', maxAge: 0 }));
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof s.LiteError ? error.status : error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 503;
    if (status === 429) res.set('Retry-After', '600');
    res.status(status).json({ error: { code: error instanceof s.LiteError ? error.code : status === 400 ? 'INVALID_JSON' : status === 413 ? 'BODY_TOO_LARGE' : 'SERVICE_UNAVAILABLE' } });
  });
  return { router, service };
}
module.exports = { createLite };
