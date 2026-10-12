require('dotenv').config();
process.umask(0o077);
const app = require('./src/app');

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
console.log(`DIGIPIN API is running and API docs can be found at at http://localhost:${PORT}/api-docs`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    server.close(() => { app.locals.pinidLite?.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
