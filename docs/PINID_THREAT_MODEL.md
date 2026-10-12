# PinID threat model — PR-00

Status: design review, controls below are proposed unless explicitly described as existing. No private vault is deployed by this PR. Read alongside [architecture](PINID_ARCHITECTURE.md) and [audit](PINID_AUDIT.md).

## Assets, actors and trust boundaries

Protect account ownership, verified contacts, invitation tokens, private location/DIGIPIN/address payloads, consent integrity, OAuth tokens, encryption keys, exports and audit integrity. Actors include owners, unauthenticated attackers, malicious tenants, approved but abusive clients, KitchenOS operators, PinID support/admins, database/hosting administrators and compromised dependencies/providers.

Boundaries: browser/proxy/API; API/OIDC provider; API/PostgreSQL; API/Redis; API/KMS; approved client/API; invite delivery channel; maps/telemetry; audit/backups/export destinations. DIGIPIN is public math: knowing a code reveals a cell. Hiding coordinates while exposing DIGIPIN does not preserve location privacy. Bearer access tokens do not by themselves prove active address consent.

## Threat/control/verification matrix

| Threat | Abuse scenario | Required control and verification | Residual risk |
| --- | --- | --- | --- |
| Alias enumeration | bulk probes reveal membership or locations | no public resolution/availability search, generic invite/lookup failures, IP/client/account limits; test timing/body similarity and throttling | public voluntary disclosure of handle; bounded authorized registration reveals conflicts |
| Invitation theft/replay | leaked link, wrong recipient or parallel redemption creates accounts | 256-bit random tokens, hash only, verified-recipient binding, single expiry and atomic consumption; replay/expiry/wrong-recipient/concurrent tests | compromised mailbox or identity provider |
| Registration bypass | provider sign-up/federation creates vault account without invite | provider registration disabled, database invitation required, provisioning saga; test direct sign-up and orphan provider subject | operator misconfiguration; recovery process needs review |
| IDOR/BOLA | user/client supplies another UUID or forged owner | every query owner/client-scoped, service checks plus relational constraints; cross-user CRUD/export/consent/grant tests | UUID secrecy is not a defense |
| Alias takeover | normalization races, reserved names, recycled identity | ASCII normalization, immutable owners, unique constraints, reserved list, tombstones; collision/concurrency tests | support-assisted disputes require controls |
| OAuth redirect/mix-up | wildcard redirect, stolen authorization code, wrong issuer | maintained provider, exact redirects, PKCE S256/state/nonce, issuer/audience/client validation; malicious URI/issuer/token-class tests | compromised approved callback server |
| Session/token theft | XSS, URL/referrer leaks, refresh replay | BFF HttpOnly cookies, no tokens in URLs/localStorage, short lifetimes, rotated refresh/reuse detection, CSP and redaction; replay/expiry tests | compromised endpoint/browser |
| CSRF | silently approve consent, delete or link account | SameSite cookie plus CSRF token and Origin checks for all cookie-authenticated writes; cross-origin and missing-token negatives | browser extensions or XSS can defeat CSRF |
| XSS/injection | address label/instructions/purpose rendered as HTML or SQL | bounded allowlisted schemas, parameterized queries, text escaping, CSP, no raw HTML; malicious input tests | unsafe map/widget dependencies |
| Location disclosure | coordinates/DIGIPIN in logs, CDN caches, analytics, exports or query strings | encrypted payloads, no-store, no PinID location query values, body/query/error redaction at every layer; log-capture/cache tests with synthetic canaries | legacy GET encode remains a disclosed risk until separately fixed |
| Insider/database access | backup reader/support admin can decrypt all addresses | envelope encryption/KMS, separate roles, audited just-in-time decrypt, no routine admin vault-read endpoint; revoked key/role tests | runtime compromise or privileged collusion |
| Consent bypass | login/loyalty scope used as universal vault permission | consent stores client/location/version/purpose/fields/expiry, live DB gate, user-delegated access token; test every binding independently | client can lie about real-world purpose after copying |
| Revocation race/cache | unexpired JWT or cached grant still returns address | no positive auth cache, shared row-lock order, deny suspended account/client, committed revoke gate; concurrent revoke/retrieve/update tests | pre-commit/in-flight responses cannot be recalled |
| Abusive approved client | bulk harvest or purpose widening | manual onboarding, field/purpose allowlists, quotas, revoke client, anomaly review; token/client mismatch and bulk tests | authorized data already copied |
| Deletion/backup restoration | erased users return after restoring old database | immediate deny/revoke, key erasure and scheduled deletion, restricted deletion ledger replay before service resumes; restore drill | legally required audit retention and backup expiry |
| Availability/abuse | expensive encode, huge payloads, Redis/DB failure | body/rate/concurrency/time limits, bounded pagination, fail-closed sensitive routes; outage/oversize tests | denial of service and provider outages |
| Supply-chain/proxy | vulnerable package, forged forwarding IP, poisoned build | lockfile CI, reviewed upgrades, secret scans, pinned release images, explicit trusted proxy; dependency and spoofed-header checks | registry compromise or runtime zero-day |

## Authorization state machine

Invitations: pending -> consumed/expired/revoked, never back to pending. Users: active -> suspended or deleting -> deleted; any reinstatement requires an audited administrator action and does not revive grants. Consents/grants: pending request -> approved active -> expired/revoked, never silently reactivated. Client disablement, location edits and deletion invalidate retrieval immediately. Login success only establishes principal identity, not a transition to granted address access.

Retrieval checks all bindings inside the authorization transaction. Revoke and retrieval use identical locking order; revoke commits before future authorization can pass. Retain tests for independently valid tokens but revoked consents, grants, clients and suspended users. Do not rely solely on provider revocation, webhooks or asynchronous cleanup.

## Logging, retention and incident response

Audit actor/resource UUIDs and action/outcome only; never tokens/hashes/contact data/precise coordinates/address contents or canonical DIGIPIN. Even UUID audit links are personal data: isolate permissions, configurable retention, append-only runtime privileges and tamper-evident export to restricted storage. Failed sensitive operations must be audited without logging submitted content. Security logs may retain minimized IP signals under a reviewed policy, segregated from user-facing audit.

Proposed technical defaults, pending legal approval: invitation expiry 48 hours; consent expiry selected by owner and capped by approved purpose (delivery initial cap 24 hours); no location retention after deletion except bounded encrypted backup lifecycle; no indefinite exports or debug logs. Retention lengths for consent evidence, audit, order copies, invitations and backups are unresolved. Avoid promising erasure deadlines before validating backup/KMS workflows. Export requires recent authentication, streams over authenticated TLS, and contains only the owner's data and consent/audit history allowed by policy.

Incident runbook must cover client suspension, token/session revocation, key compromise/rewrap, invitation disablement, log leak containment, user notifications and provider/database restore. Test that key/database/Redis failures do not downgrade to plaintext or unauthenticated access. Keep emergency disable switches and two-person access for sensitive operational recovery.

## Indian privacy review and unresolved legal decisions

Engineering review, not a compliance certification. The final DPDP Rules 2025 Gazette was inspected, not only the January draft: [MeitY Gazette PDF](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf). Rule 1 phases commencement: rules 1/2/17–21 at publication, rule 4 one year later, rules 3/5–16/22/23 eighteen months later. Recheck applicable Act commencement notifications and amendments with Indian counsel before launch; do not infer all obligations are already operative on this audit date.

Design now for specific plain-language notices, itemized data/purposes, evidence of freely given consent, equally accessible withdrawal, safeguards, grievance routes, correction/erasure/export workflows and breach handling. Address recipient verification is not government identity or residency verification. PinID's internal consent feature does not establish the statutory status of a registered Consent Manager.

Counsel/operator must decide: data fiduciary/processor roles for PinID, KitchenOS, hosting/maps/invite providers; operator/legal contact and grievance officer; children's access/age assurance (propose adults-only launch until reviewed); lawful basis and retention for each purpose; cross-border hosting/transfers/subprocessors; breach reporting procedures and deadlines; audit/backup erasure exceptions; client deletion commitments; DHRUVA ecosystem participation; trademark/official emblem permissions. Block public launch until these decisions, provider hardening and the existing misleading government attribution have been resolved.
