# PinID implementation plan

PR-00 only is authorized now. Architecture review is required before PR-01. No automatic merge. Each PR must include scoped unit/integration/regression/negative tests, OpenAPI for implemented endpoints, deployment notes, executed results, limitations and rollback. Do not list a planned check as passed.

## PR sequence and acceptance gates

| PR | Scope | Required evidence / gate |
| --- | --- | --- |
| PR-00 | actual repository audit; architecture/threat/migration/implementation plans; dependency-free baseline tests and syntax/OpenAPI checks; CI | existing runtime untouched, published DIGIPIN examples pass, known defects visible, audit findings and decisions reviewed |
| PR-01 | PostgreSQL migrations/repository/service boundaries, independent users, controlled namespace/aliases, verified-recipient invitation lifecycle, suspension/deletion state; admin bootstrap | provider decision/provisioning spike first; transactional uniqueness/redemption races, generic failures, cross-owner denial, clean install/reapply/upgrade; versioned OpenAPI and config docs |
| PR-02 | encrypted private vault, confirmed map/GPS/manual location entry, canonical DIGIPIN adapter, owner CRUD/export/deletion and audit | fix or isolate legacy logging/validation before vault enablement; encryption/tampering/ownership/finite coordinate tests, actual backup/key restore, location edit invalidation |
| PR-03 | maintained provider integration, PKCE OIDC portable login, approved client registry, explicit consent/grants/retrieval/revocation | wrong issuer/audience/redirect/PKCE, expired/replayed refresh, CSRF, client/scope/location/purpose/field mismatch, concurrent revocation, suspended-user/client tests |
| PR-04 | KitchenOS integration contract and PinID UI for account link/unlink, location selection, consent management | inspect/authorize KitchenOS repository separately; stable issuer+subject mapping, linking confirmation, denied/expired grant UX, independence during KitchenOS outage; accessible UI and no token leakage |
| PR-05 | operational/security hardening and release readiness | resolve audit/legal/provenance gates, least privilege, retention/erasure restore drills, sanitized logs, quotas, abuse response, secrets scanning, dependency audit, full migration matrix and release review |

Tests involving provider/database/Redis must use ephemeral real services. Unit mocks alone cannot establish isolation, locking or protocol correctness. Keep legacy API regression suite in each PR and add selected official-vector/boundary tests when engine behavior changes. CI needs bounded service readiness, no production secrets or real user data. Pin tool/runtime/image versions and reevaluate maintenance/advisories when dependencies are added.

## PR-00 implementation and checks

Adds the four requested planning documents plus repository audit and verification/deployment notes. Tests use Node's built-in runner, HTTP loopback servers and `fetch`; no new dependencies or runtime middleware. Node 22/24 are the proposed CI versions; actual local version is recorded in [verification](PINID_PR00_VERIFICATION.md). `npm run check` is syntax plus YAML/reference consistency checking, not ESLint or full OpenAPI conformance validation. There was no lint/build/migration tooling before this PR.

Fixtures distinguish official published examples from independently derived boundaries/local regressions. `test/known-defects.test.js` characterizes current unsafe parsing and contains remediation TODOs; passing characterization is not a security fix. Coverage is measured, not asserted as a universal correctness guarantee. New negative authorization tests confirm PinID routes remain absent; real owner/client authorization negatives begin with the implementation PRs.

CI uses read-only contents permissions and npm clean install with install scripts disabled (the installed dependency graph currently includes an optional vendor telemetry install hook). It does not deploy, merge or use production credentials. PR-00 corrects dangling Swagger ErrorResponse reference and demonstrably inaccurate decode/encode examples; endpoint shape, statuses and engine behavior remain unchanged. It labels service independence while retaining upstream technical attribution.

## Review checklist before PR-01

- Accept independent core ownership and `name.pincode.cafe` host; handles are `username@pincode`.
- Select OIDC provider, stable issuer/audience, verified-recipient channel, invite-only provisioning/recovery approach and administrator MFA.
- Approve normalization/reserved names/tombstones/alias limits, encryption including canonical DIGIPIN, and location update reconsent.
- Approve grant bindings, field/purpose allowlists, expiry caps and committed-revocation semantics.
- Confirm actual production platform/KMS/PostgreSQL/Redis, secret management, backups and operation owners.
- Assign privacy/legal decisions and upstream licensing/branding remediation; no claim of government verification or affiliation.

Review can approve the design with tracked follow-ups, but private vault/client retrieval must remain disabled until its security release gates pass. Pricing/payment and any national DHRUVA integration are separate future scopes, not implied by this sequence.
