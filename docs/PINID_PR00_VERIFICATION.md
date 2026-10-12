# PR-00 verification and deployment notes

Status: local and clean-install verification executed. PR-00 is planning/test tooling only, no PinID runtime endpoints or database.

## Reproduce

Use Node 22 or 24 (local tested version to be recorded). On PowerShell with script execution disabled, use `npm.cmd` instead of `npm`.

```text
npm ci --ignore-scripts
npm run check
npm test
npm run test:coverage
npm audit --json
npm start
```

`npm ci` is intended for a clean checkout: the existing developer node_modules and local lockfile changes are not proof of a reproducible installation. Install scripts are disabled for baseline CI; no runtime dependency currently requires native compilation. There is no build or actual lint task in the API. `check` provides syntax and OpenAPI reference/operation checks, not a full standards validator. Future PostgreSQL/Redis/OIDC tests are not applicable because no such implementation/migrations exist.

Tests bind random loopback ports and use synthetic, published or example coordinates, never real user secrets. Existing Morgan prints these synthetic query strings, exposing the known logging issue. Do not upload production log captures. Invalid JSON tests exercise current Express HTML error behavior; no claim of standardized PinID errors yet.

## Executed results

Executed on 2026-10-13 with Node v24.20.0/npm 10.5.1:

| Check | Result |
| --- | --- |
| Local npm run check | passed JavaScript syntax, YAML parsing and local reference/operation checks |
| Local npm run test:coverage | 29 passed, 0 failed, 2 explicit remediation TODOs; 31 total |
| Coverage for loaded src modules | 100% lines/functions, 97.37% branches; engine branches 96.15%; server.js process startup not included |
| Clean installation from git archive of baseline plus PR files and untouched committed lockfile | npm ci --ignore-scripts passed; 92 packages installed |
| Clean-install check and coverage tests | passed; same existing runtime and test suite |
| git diff --check | passed |
| Migration/build/lint | no migrations/build/lint configuration exists; not claimed executed |
| GitHub Actions Node 22/24 matrix | not claimed passed by local execution; observe on PR |

The first sandboxed check/test attempt failed with child-process EPERM; the unrestricted rerun above passed. No production service or data was accessed. Initial `npm.cmd audit --json` against the preexisting local installation reported zero vulnerabilities. A fresh network-enabled audit of the committed-lockfile installation instead returned exit 1 and **12 vulnerable dependency records: 1 critical, 3 high, 7 moderate, 1 low**. Treat the clean result as the release finding; the differing earlier result is not a clean bill of health. npm audit counts dependency records, not independently verified exploitable endpoints.

| Severity | Affected dependency records |
| --- | --- |
| Critical | proxy-addr |
| High | brace-expansion, minimatch, path-to-regexp |
| Moderate | argparse, body-parser, morgan, qs, sprintf-js, yaml, yamljs |
| Low | on-headers |

Examples: [proxy-addr IP spoofing advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [path-to-regexp denial-of-service advisory](https://github.com/advisories/GHSA-j3q9-mxjg-w52f), [YAML stack overflow advisory](https://github.com/advisories/GHSA-48c2-rrv3-qjmp). These need reachability/configuration review; current app does not set trust proxy, load user-provided YAML or use yamljs. That does not justify declaring the whole graph safe. Installation also warns about deprecated inflight/glob. No dependency remediation is included in PR-00; address before release through a scoped change with regressions. Do not run npm audit fix --force blindly.

## Deployment and rollback

Existing runtime: `PORT` (default 5000), optional `NODE_ENV`, `npm start` -> server.js. No repository Docker/platform manifests or deployment workflow were present on main. Existing application does not have graceful shutdown or a dedicated readiness endpoint; no PinID enablement is possible from this PR. Production platform/domain/TLS/proxy configuration remains unverified.

PR-00 adds test/check scripts and a read-only CI workflow; it neither deploys nor merges. No new environment secrets or dependency versions. Legacy routes and engine are unchanged. Swagger corrections affect docs only. Revert this PR's changed files to roll back; no data restoration/down migrations needed. Existing local lockfile edits and nested UI repositories are excluded from the PR.

Review blockers for later work: architecture approval, OIDC provisioning choice, encryption/retention/hosting decisions, coordinate validation/logging remediation, independent operator notices and licensing/branding review. PR-01 remains unimplemented.
