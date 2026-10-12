'use strict';
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
process.umask(0o077);
let app;
try { app = require('./src/app').createApp(); }
catch { process.stderr.write('PinID startup failed. Check storage, keys, origin and configuration.\n'); process.exit(1); }
const port = Number(process.env.PORT || 5001);
const host = process.env.PINID_HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 0 || port > 65535) { app.locals.pinid?.close(); process.exit(1); }
const server = app.listen(port, host, () => process.stdout.write(`PinID listening on http://${host}:${server.address().port}\n`));
server.on('error', () => { app.locals.pinid?.close(); process.stderr.write('PinID listener failed.\n'); process.exit(1); });
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  server.close(() => { app.locals.pinid?.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
});
