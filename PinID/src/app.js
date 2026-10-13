'use strict';
const express = require('express');
const { loadConfig } = require('./config');
const { createLite } = require('./routes');
function createApp(config = loadConfig(), providedService) {
  if(config?.backend==='postgres'&&!providedService)throw new Error('PostgreSQL requires async app startup');
  const app = express(); app.disable('x-powered-by');
  if (!config) {
    app.use((req, res) => res.status(503).set('Cache-Control', 'no-store').json({ error: { code: 'PINID_DISABLED' } }));
    return app;
  }
  const lite = createLite(config,providedService); app.locals.pinid = lite.service;
  app.get('/healthz', async (req, res) => {
    try { res.status(await lite.service.health() ? 200 : 503).json({ status: 'ok', pinid: 'enabled' }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });
  // One service/session store, with the original prefix retained for old clients.
  app.use('/pinid', lite.router);
  app.use('/', lite.router);
  app.use((req, res) => res.status(404).set('Cache-Control', 'no-store').json({ error: { code: 'NOT_FOUND' } }));
  return app;
}
async function createAppAsync(config=loadConfig()) {
  if(config?.backend==='postgres'&&config.autoMigrate){
    if(!config.migration)throw new Error('PostgreSQL migration credential required');
    await require('./postgres-repository').migrate(config.migration);
  }
  const service=config?.backend==='postgres'?await require('./postgres-service').Service.create(config):undefined;
  return createApp(config,service);
}
module.exports = { createApp,createAppAsync };
