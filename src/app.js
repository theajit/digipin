const express = require('express');
const cors = require('cors');
const digipinRoutes = require('./routes/digipin.routes');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const fs = require('fs');
const path = require('path');

// const swaggerDocument = YAML.load(path.join(__dirname, '../swagger.yaml'));
const swaggerDocument = YAML.parse(fs.readFileSync(path.join(__dirname, '../swagger.yaml'), 'utf8'));

const app = express();

// PinID is deliberately mounted before legacy CORS/body/error middleware.
// No request logger: URLs, credentials and coordinate payloads must stay private.
app.disable('x-powered-by');
const liteConfig = require('../PinID/src/config').loadConfig();
if (liteConfig) {
  const lite = require('../PinID/src/routes').createLite(liteConfig);
  app.use('/pinid', lite.router);
  app.locals.pinidLite = lite.service;
}
app.get('/healthz', (req, res) => {
  try { res.json({ status: 'ok', pinid_lite: app.locals.pinidLite ? (app.locals.pinidLite.health() ? 'enabled' : 'unavailable') : 'disabled' }); }
  catch { res.status(503).json({ status: 'unavailable' }); }
});

// Middleware
app.use(cors());
app.use(express.json());

// Swagger Docs Route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// DIGIPIN API Routes
app.use('/api/digipin', digipinRoutes);

// Privacy Policy Page
app.get('/privacy-policy', (req, res) => {
  res.sendFile(path.join(__dirname, '../docs/privacy-policy.html'));
});

// Disclaimer page.html
app.get('/disclaimer', (req, res) => {
  res.sendFile(path.join(__dirname, '../docs/disclaimer.html'));
});
app.use('/docs', express.static(path.join(__dirname, '../docs')));

// Preserve legacy middleware-error status and HTML content type without logging
// parser excerpts, stack traces, coordinate values or request contents.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
  res.status(status).type('html').send('Request could not be processed.');
});

module.exports = app;
