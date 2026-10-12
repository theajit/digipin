# PinID Lite evidence policy

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
