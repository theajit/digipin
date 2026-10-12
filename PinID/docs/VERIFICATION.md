# PinID Lite evidence policy

## Current standalone verification — 2026-10-13

`PinID/` now runs independently. Root server/app/package/lockfile/check script were restored to PR-00 baseline. The earlier integrated-folder entries below describe prior revisions only.

Executed: PinID syntax checks and coverage tests: 24 passed, zero failures, 98.91% line coverage. Root checks and DIGIPIN regression suite: 29 passed, two existing audit TODOs. Copied only PinID source to ignored `test-data/isolated-pinid`, excluding dependencies, secrets and generated data; independent `npm ci --ignore-scripts`, syntax checks and all 24 tests passed there. Clean install reported zero dependency advisories.

Started the isolated copy's actual `server.js` on local port 43253 with synthetic development secrets and explicit SQLite storage gate. Edge loaded `/` and its own branded assets/API paths. Actual UI screenshot: root ignored `test-data/evidence/pinid-standalone-ui.jpg`. Prior per-item screenshots below remain evidence of the earlier MVP flow. No production deployment, external TLS, real-device GPS or production storage durability is claimed.

Generated data can live in either root `/test-data/` or standalone `PinID/test-data/`; both are Git-ignored. Deploy only PinID, install its dependencies, retain its configured durable directory and keys, and run one process. Rollback stops/restores only PinID; the independent DIGIPIN server is unaffected.

Generated test data belongs in the Git-ignored `/test-data/` directory: SQLite files, disposable credentials, captured test logs, reports and screenshots. Do not use production data or credentials. Published official reference vectors remain tracked test source, not generated/private data.

Run `npm test` to create isolated `test-data/runs/pinid-lite-*` fixtures. They are retained for local diagnosis and never uploaded to GitHub. Test close hooks release database connections. Remove an individual run only after its processes have exited and after verifying the resolved path is inside this directory.

Screenshots must come from actual browser/application or executed verification results. A screenshot of an API/test report documents that result; it is not a claim that invisible cryptographic guarantees were verified visually. Include actual test assertions for encryption, replay, authorization, races and persistence. Label simulated GPS or local-only tests explicitly. Never include live credentials in screenshots.

For each delivery, link evidence to the relevant checklist item and state anything not verified, including actual production hosting/durability. All browser evidence here is local-only; no merge/deploy is implied.

## Executed evidence — 2026-10-13

The full Node TAP run passed 38 tests with 0 failures and 2 preexisting legacy TODOs. The UTF-8 results are retained locally in `test-data/evidence/tests.tap`. Git check-ignore confirmed that the generated fixture directories, secrets and evidence are excluded.

Real Edge browser flow: invitation plus manual confirmed coordinates -> `ajit@pincode` -> canonical `4P3JK83M28`; recovery credential displayed once and hidden before screenshots; sign-out -> credential recovery -> private dashboard. A 390px viewport check found no horizontal overflow. Completed sign-out was checked to remove the saved coordinates and DIGIPIN from the visible DOM.

Browser testing found and fixed a global `location()` name collision that prevented JavaScript initialization. Forms now use POST with disabled submit buttons until boot completes, preventing GET-URL credential/address fallback. A negative API test verifies native URL-encoded recovery requests are rejected. Sign-out now clears location previews as well as dashboard/input values.

Saved actual UI evidence: `03-enrollment-ui.jpg`, `04-confirmation-ui.jpg`, `03-mobile-ui.jpg`, `07-recovery-ui.jpg`, `08-owner-dashboard-ui.jpg`, `09-signed-out-ui.jpg`. Ten additional `01-verification.jpg` through `10-verification.jpg` screenshots show executed-test evidence for the numbered MVP contract. These are test-report screenshots, not product UI claims. No live credentials are included.

Not verified: real-device GPS acquisition/permission, current production topology, durable production volume, live deployment and external TLS/proxy configuration. Manual location entry was verified. Screenshots and test records remain local and are not attached to the public PR.

## PinID folder and branding — branch `pinid`

Moved the backend, migration, UI, tests, CLI and documentation under `PinID/`. Root server continues to mount the same `/pinid` API/UI; legacy `/api/digipin` and its engine remain unchanged. All 38 tests passed (2 preexisting TODOs) after relocation, including real SQLite and separate-process persistence. Root JavaScript/OpenAPI checks and diff whitespace checks passed. The folder has convenience start/test/invite scripts and uses root dependencies; no duplicate database or new service is introduced.

Inspected live DIGIPIN and Cult HTML/CSS. Matched their ink/warm-paper palette, bold type, italic emphasis and crisp borders, using the local café logo and DIGIPIN orange. Browser enrollment on the new tree again produced `ajit@pincode` and `4P3JK83M28`. No browser JavaScript errors were observed. A 390px viewport had no horizontal overflow. Local screenshots: `pinid-branding-desktop.jpg`, `pinid-branding-mobile.jpg`, `pinid-branding-dashboard.jpg` in root ignored `test-data/evidence/`.

No source DB/key/migration format changes are required for this move. Rollback restores the previous module paths/UI and root mount references; preserve the persistent directory and secrets. No merge or deployment was performed.
