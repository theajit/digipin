# Repository audit — PinID PR-00

Inspected 2026-10-13; local main HEAD `a15339e8fdea93b13ae0d7336e567c9ae6ceac8e`. Remote `theajit/digipin` is public, main is its default branch. This is a source/history audit, not an inspection of live production or an independent penetration test.

## Source tree and history

Tracked application: `server.js`, `src/app.js`, `src/routes/digipin.routes.js`, `src/digipin.js`, `swagger.yaml`, `package.json`, `package-lock.json`. Tracked content: README, Apache LICENSE, technical specification, changelog, privacy/disclaimer Markdown and HTML, grid/logo images. `.gitignore` ignores node_modules, .env/local, logs and editor files. No AGENTS.md applies in the inspected workspace/ancestors.

All tracked source modules and OpenAPI were read; documentation/privacy/disclaimer and history were inspected. Main history contains eight commits from initial November 2025 scaffolding through May 2026 standards/doc revision. Engine provenance is preserved in source comments. Other local refs include `digipin-ui` and `pincode-cafe-website`; root has two untracked nested Git checkouts (`Digipin UI/`, `Pin Code Cafe Website/`) with Vite/React sources and separate deployment commands. They are not API main contents and are excluded from this PR. No KitchenOS repository was inspected or changed.

Preexisting local `package-lock.json` changes only root package version from 1.0.0 to 2.0.0 (two lines); preserved and excluded. Tracked lockfile's root version is stale. Neither copy introduces PinID dependencies. Root package scripts start `server.js`, reference uninstalled nodemon for dev and previously had an intentionally failing test placeholder.

## Confirmed runtime/dependencies

CommonJS JavaScript; local Node v24.20.0. Express **5.1.0**, despite README claiming Express 4 and Node 14 support. npm installed top-level graph: cors 2.8.5, dotenv 16.4.7, morgan 1.10.0, swagger-ui-express 5.0.1, yaml 2.7.1, yamljs 0.3.0, plus a self-referential `digipin: file:` dependency. yamljs is unused (commented historical loader is obsolete), and the self-link is unnecessary. No database/ORM/Redis/OIDC/password library/frontend runtime in API main. Avoid removing/upgrading packages during baseline work.

`server.js` loads dotenv, binds PORT/default 5000, no graceful termination/readiness. `src/app.js` constructs/export Express app, wildcard cors, default JSON parser, morgan dev logging, Swagger UI and static docs/legal pages. Routes expose GET and POST encode/decode without authentication. Engine divides bounds latitude 2.5–38.5/longitude 63.5–99.5 into 4x4 grids for ten levels; outputs approved ten characters. Decoder accepts lower-case/outer whitespace, rejects internal punctuation, returns six-decimal string cell centres.

## Deployment, CI and coverage

No Dockerfile/compose, .github workflow, platform manifest, database migration, automated test, lint or build script on audited main. README describes npm install, PORT/NODE_ENV and npm start; dev script lacks nodemon dependency. Separate UI deployment hints do not establish the API production platform. No provider credentials, production network, secrets store or backup configuration was accessed. Branch protection/live CI configuration outside source is unverified.

Before PR-00, there was no meaningful test coverage. PR-00 adds engine/API regressions, invalid inputs, known-defect characterization, syntax/local OpenAPI-reference checks and a read-only Node 22/24 CI workflow. See [executed verification](PINID_PR00_VERIFICATION.md).

## Findings

| ID / priority | Evidence | Required action |
| --- | --- | --- |
| AUD-01 high before vault | engine lacks finite/type checks; GET parseFloat accepts suffix garbage; missing longitude emits repeated undefined strings; POST destructures missing body outside try | strict PinID coordinate adapter and separately reviewed legacy fix; regression tests must identify deliberate compatibility changes |
| AUD-02 high before vault | morgan dev logs req URL including GET coordinates/DIGIPIN; default errors can expose stacks; no redaction contract at proxy | structured allowlisted logging, sanitize errors/query/body at every layer; synthetic log leak tests |
| AUD-03 high before identities | no auth/owner checks/provider/consents/persistence | new versioned routes fail closed; preserve existing public mathematical conversion API |
| AUD-04 medium | wildcard CORS, x-powered-by, default error HTML, no explicit security headers/rate limits/proxy/session config | narrow PinID CORS, HTTPS/security headers/body limits/CSRF/Redis quotas; no blind trust proxy |
| AUD-05 medium | Swagger references ErrorResponse but omits schema; examples encode 13.067526/80.270956 as code for different point and decode gives original coordinates instead of cell centre | PR-00 corrects docs, adds ref check; document residual coercion/body parser behavior |
| AUD-06 legal/launch gate | Apache LICENSE/README versus ISC package metadata; source credit India Post; copied official disclaimer presents Department of Posts as issuer/operator and adds reproduction wording | preserve license/source notices; review permissions/NOTICE obligations and trademark/logo use; publish independent operator terms before launch, resolve package license in reviewed follow-up |
| AUD-07 medium | README Node14/Express4 badges inconsistent with Express5; stale lock root version; unused yamljs/self-link; missing nodemon | PR-00 deploy notes specify tested runtime; scope dependency/metadata cleanup separately |
| AUD-08 medium | no schema backups, retention/export/deletion, health/shutdown or deploy CI | additive migration and operations plan; production readiness gates |
| AUD-09 high/critical release gate | clean committed-lockfile installation reports 12 vulnerable dependency records (1 critical, 3 high, 7 moderate, 1 low), despite initial local audit returning zero | review reachability and upgrade/remove affected packages in a scoped security follow-up before release; do not run blind audit fix |

## Provenance/licensing and reuse

Git blob identity for local `src/digipin.js` is `02a89afa066a30f5cf2a55dbc2a64e7964efbf30`, matching the official repository source inspected via GitHub on audit date. This establishes source equality at that snapshot, not a future update policy or government endorsement. Official published encode/decode README vectors are included with source metadata; independent boundary/property tests supplement them. No complete formal official vector suite was found in the inspected material; do not claim exhaustive conformance.

Reuse the unchanged engine, app export (testable without process startup), route mount and YAML/Swagger stack. Keep license/source attribution, inventory official images before public PinID UI work and resolve the copied disclaimer/package metadata conflict. Do not treat generic government statements as this independent operator's privacy policy. Sources: [official engine](https://github.com/INDIAPOST-gov/digipin/blob/main/src/digipin.js), [official license](https://github.com/INDIAPOST-gov/digipin/blob/main/LICENSE), [technical specification](https://github.com/INDIAPOST-gov/digipin/blob/main/docs/DIGIPIN_Technical_Document.md).

Dependency audit results and limits are in the verification document. Dependency audit success does not mitigate the application findings above or establish absence of vulnerable code. No secret values were read or printed; ignore rules alone do not establish that repository history is secret-free. Historical secret scanning is a required PR-05 check using a maintained scanner with sanitized output.
