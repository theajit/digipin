'use strict';
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
process.umask(0o077);
let app;
async function main(){
try { app = await require('./src/app').createAppAsync(); }
catch (error) { process.stderr.write(`PinID startup failed. ${require('./src/startup-error').startupHint(error)}\n`); process.exit(1); }
const port = Number(process.env.PORT || 5001);
const host = process.env.PINID_HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 0 || port > 65535) { app.locals.pinid?.close(); process.exit(1); }
// Express 5 may call a listen callback with an error before an address exists.
// Handle native server events separately so failed DNS/binds cannot log success.
const server = require('node:http').createServer(app);
server.on('error', () => { app.locals.pinid?.close(); process.stderr.write('PinID listener failed.\n'); process.exit(1); });
server.once('listening', () => {
  const address = server.address();
  if (!address || typeof address !== 'object') return;
  process.stdout.write(`PinID listening on http://${host}:${address.port}\n`);
});
server.listen(port, host);
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  server.close(async () => { try { await app.locals.pinid?.close(); process.exit(0); } catch { process.exit(1); } });
  setTimeout(() => process.exit(1), 10000).unref();
});
}
main().catch(()=>{process.stderr.write('PinID startup failed. Check configuration and database availability.\n');process.exit(1);});
