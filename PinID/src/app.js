'use strict';
const express = require('express');
const { loadConfig } = require('./config');
const { createLite } = require('./routes');
function createApp(config = loadConfig()) {
  const app = express(); app.disable('x-powered-by');
  if (!config) {
    app.use((req, res) => res.status(503).set('Cache-Control', 'no-store').json({ error: { code: 'PINID_DISABLED' } }));
    return app;
  }
  const lite = createLite(config); app.locals.pinid = lite.service;
  app.get('/healthz', (req, res) => {
    try { res.status(lite.service.health() ? 200 : 503).json({ status: 'ok', pinid: 'enabled' }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });
  // One service/session store, with the original prefix retained for old clients.
  app.use('/pinid', lite.router);
  app.use('/', lite.router);
  app.use((req, res) => res.status(404).set('Cache-Control', 'no-store').json({ error: { code: 'NOT_FOUND' } }));
  return app;
}
module.exports = { createApp };
