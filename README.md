# PinID — by Pin Code Café

The pinid branch contains the standalone invite-only private address beta. Identity format: username@pincode; intended host: name.pincode.cafe.

The application lives entirely inside [PinID/](PinID/README.md), with its own server, UI, private API, dependencies, migrations and tests. The legacy DIGIPIN API runtime, Swagger and package are absent from this branch. Existing DIGIPIN deployments and other branches remain independent. Only the attributed encoding engine and reference vectors needed by PinID are bundled locally.

Run inside PinID: npm ci --ignore-scripts, npm run check, npm test, then npm start. Configure secrets and durable local storage before enabling. UI: /; private API: /api; health: /healthz.

See [deployment and rollback](PinID/README.md) and [verification](PinID/docs/VERIFICATION.md). No public address resolution, government verification, payments or third-party access. PR-00 documents in docs/PINID_* remain historical context. Generated data, credentials and evidence stay Git-ignored.
