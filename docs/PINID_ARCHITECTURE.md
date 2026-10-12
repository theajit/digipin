# PinID architecture — PR-00 review proposal

Status: proposed, not implemented. Audit date: 2026-10-13. Baseline: `a15339e8fdea93b13ae0d7336e567c9ae6ceac8e` on `theajit/digipin/main`.
Approval of this architecture is the gate for PR-01. The only executable additions in PR-00 are tests, checks and CI. See [audit](PINID_AUDIT.md), [threat model](PINID_THREAT_MODEL.md), [migration plan](PINID_MIGRATION_PLAN.md) and [implementation plan](PINID_IMPLEMENTATION_PLAN.md).

## Product and trust contract

PinID owns an independent user account with a stable immutable UUID. A changeable alias such as `ajit@pincode` is a human-friendly identifier, never an authentication credential or database ownership key. The proposed user-facing host is `name.pincode.cafe`; it is one application host, not a subdomain per username. DNS/TLS ownership and production topology remain unverified.

Invite-only registration, private labeled locations, export/deletion and granular revocation are core functions. KitchenOS is the first approved client, not the account authority. No public handle-to-location lookup. Login, loyalty membership and possessing an alias never grant address access. Subscription pricing and multiple-handle entitlements are deferred beyond the requested PR sequence; payment must never gate export, deletion or revocation.

PinID is an independent service. It does not verify government identity, residency, address ownership or deliverability, and is not affiliated with India Post. DIGIPIN identifies a grid cell, not a household or person. Several apartments may share a cell; floor/unit/instructions remain separate private fields.

## Actual foundation and proposed modules

The foundation is CommonJS Node.js, Express 5.1.0, `cors`, `morgan`, `dotenv`, `yaml` and Swagger UI; there is no ORM, database, Redis, authentication provider or PinID frontend on main. Preserve `server.js`, `src/app.js`, `src/digipin.js` and `/api/digipin/{encode,decode}` GET/POST contracts until a separately reviewed compatibility fix. Existing Swagger remains the legacy API document.

Extend one Express application:

```text
name.pincode.cafe -> TLS reverse proxy -> Express routes
                                           | authentication/policy middleware
                                           | PinID services -> PostgreSQL repositories
                                           | vault encryption adapter -> KMS
                                           | ephemeral/rate-limit adapter -> Redis
                                           | OIDC resource-server adapter -> provider
Approved application -> OIDC provider -> login
Approved application -> Express address API -> live grant/consent check -> vault
```

Proposed `src/pinid/{routes,services,repositories,validation,security}` boundaries: routes parse/validate and serialize; services enforce ownership and transactions; repositories issue parameterized SQL; encryption/OIDC adapters hide external dependencies. A repository is never called directly from a route. Services receive authenticated UUIDs, not caller-supplied owners. Start with `pg` and explicit SQL rather than an ORM and use a maintained JOSE/OIDC library for resource-server verification. Dependency and Node version selection must be revalidated and pinned when introduced.

PostgreSQL is the authoritative record store. Redis holds rate counters, PKCE/state/nonce transactions and short-lived sessions, not authoritative consents or location plaintext. Redis failure fails closed for login, registration and sensitive write flows; no positive authorization cache in the first release. Disable third-party retrieval during database/KMS outages. Use separate database roles for migrations, runtime and constrained audit processing. Keycloak's database, if used, has a separate schema/database and credentials, not PinID's table owner.

## Authentication provider decision

Prefer a separately operated, maintained Keycloak OIDC provider on a stable HTTPS issuer controlled by PinID, subject to operational review. This is infrastructure, not a new custom business microservice. Managed standards-compliant OIDC is the fallback if operating Keycloak is not supportable; preserve issuer stability/export capability. Do not implement token signing, authorization codes or password management manually.

Before PR-01, choose the provider and prove invite-only provisioning in a staging spike: disable provider self-registration; require recipient verification; prevent registration through federation/recovery flows; never expose a provisioning credential to the browser. A verified provider session plus unconsumed invitation is required to create a PinID account. Provider-only accounts have no vault rights. Provisioning is a retryable saga with an idempotency key; PostgreSQL commits invitation consumption and user/alias creation atomically. Reconcile orphan provider accounts; never grant access before the database account exists. Do not implement a temporary custom password system in PR-01.

Provider settings: Authorization Code only, PKCE S256 mandatory, no implicit/password grant, no unrestricted dynamic client registration, exact allowlisted HTTPS redirect/logout URIs (explicit localhost exceptions only in development), approved clients only. Require state and nonce in SDK/BFF flows; validate signature using trusted discovery/JWKS, allowed algorithms, exact issuer, API audience, expiry/not-before and authorized client. Reject ID tokens at resource APIs. Use short access-token lifetime (proposed five minutes), refresh-token rotation/reuse detection, bounded sessions, logout/revocation and MFA for administrators. Provider logout is not address-consent revocation; implement both paths independently.

PinID's owner web UI should use a same-origin BFF with secure HttpOnly SameSite cookies, CSRF tokens and Origin checks. Tokens stay server-side, never localStorage or URLs. KitchenOS's OIDC link key is the exact `(issuer, subject)` pair, not email or alias. Provider subject mapping has a unique constraint; usernames can change without breaking app links. A stable pair across approved applications is a deliberate correlation tradeoff disclosed to users; adopting pairwise subjects later requires a documented migration.

## Proposed records and invariants

All primary identifiers are immutable UUIDs. Timestamps are UTC `timestamptz`. Foreign keys and transactions enforce integrity; UUIDs do not replace authorization. Each row has only needed fields, not an unrestricted metadata JSON dumping ground.

| Record | Fields and invariants |
| --- | --- |
| users | UUID, issuer/subject unique pair, status active/suspended/deleting/deleted, created/updated/deleted timestamps; encrypted verified-contact data and keyed recipient lookup where needed |
| invitations | UUID, unique SHA-256 hash of 256-bit random token, keyed normalized recipient binding, expiry, consumed/revoked timestamp, issuing admin UUID; token never stored/logged |
| namespaces | UUID, unique normalized slug; initially only controlled `pincode`; user cannot create namespaces |
| aliases | UUID, owner UUID, namespace UUID, normalized username, active/tombstoned status; unique `(namespace_id, normalized_username)` including tombstones to prevent impersonation by reuse |
| locations | UUID, owner UUID, encrypted label/address/unit/instructions/coordinate/DIGIPIN payload, format/key version, authenticated encryption nonce/tag and wrapped key, row version, confirmed_at, coordinate source, created/updated/deleted timestamps |
| oauth_clients | UUID, unique provider client ID, approved/disabled status, display name, reviewed purposes/fields, exact redirect allowlist, contact/policy version; secret material belongs in provider/secret manager |
| consents | UUID, user/client/location UUIDs, exact purpose, allowlisted field set, consent notice version, selected location version, expires/revoked timestamps; immutable authorization terms |
| grants | UUID, consent/user/client/location UUIDs, allowed scope, expiry <= consent expiry, revoked timestamp; foreign/composite constraints prevent inconsistent ownership/client relationships |
| audit_events | UUID, actor pseudonymous UUID/type, action/outcome, resource UUID, client UUID, timestamp, correlation ID; no addresses, coordinates, DIGIPIN values, aliases, tokens or request bodies |

Coordinates and DIGIPIN are both sensitive: DIGIPIN is reversibly geocoded. Store canonical DIGIPIN as the ten-character string inside the encrypted payload, never plaintext index columns. Validate canonical format before encryption and after decryption (`^[23456789CJKLMPFT]{10}$`); a database CHECK cannot validate encrypted contents. If reviewers require a plaintext canonical column, they must explicitly accept its location-disclosure risk. Schema CHECKs enforce statuses, nonempty hashes, positive expiry windows and mandatory payload/key versions; services enforce permitted fields and payload schema.

Proposed aliases: trim/lowercase ASCII, 3–30 characters, `^[a-z0-9][a-z0-9_-]*[a-z0-9]$`; reject Unicode confusables and parsing of embedded `@`. Format alias with controlled namespace server-side. Reserve admin/api/auth/support/security/india-post/indiapost/government/www and brand/service names using a versioned list. Unique conflicts are handled transactionally with nonrevealing registration errors. No public availability endpoint or bulk search; authenticated invitation flows get bounded generic feedback. Alias count/rename policy requires review, not pricing implementation in PR-01.

Invitation redemption checks verified recipient match, unexpired/unrevoked status, account status and atomic single consumption under row locking or conditional UPDATE. User/alias/invitation mutation occurs in one transaction; rollback consumes nothing on failure. Duplicate/replayed/invalid/expired invitations have the same external failure. Recovery verifies recipient ownership but makes no residency claim. Suspend before session cleanup to immediately deny APIs.

## Vault and encryption

Location entry accepts map pin, GPS or manual finite numeric coordinates within official bounds. GPS acquisition is opt-in. User sees and explicitly confirms the selected point, captured accuracy where available and delivery fields. Do not accept caller-supplied DIGIPIN as authoritative when coordinates are present; derive using the validated existing engine. Decoding returns a rounded cell centre, not exact original coordinates. No silent reverse-geocoding or unreviewed third-party map disclosure. Map tile/provider requests may reveal viewport/IP; disclose them, restrict keys and assess provider agreements.

Use per-user envelope keys with AES-256-GCM through maintained platform cryptography, random unique nonces and AAD binding user UUID, location UUID and payload version. Wrap data keys with KMS-managed KEKs; rotation rewraps keys with recorded versions, with restore tests for old versions. Never place production keys in source, database plaintext, images, local .env templates or logs. Separate decrypt permissions from database administration; production decrypt access is least privilege and audited. Encrypt backups and contact/recipient data as well. Index only owner/status/timestamps, not geospatial data. Owner lists may decrypt labels only after ownership checks.

## Consent, grants and revocation

Client requests a reviewed purpose and requested fields (initially delivery.coordinates, delivery.digipin, delivery.address, delivery.instructions). Owner selects a private location in the PinID UI and sees client identity, purpose, fields, expiry and location preview. Unknown/broadened purpose or fields are rejected; consent is separate from OIDC login. Purpose is a declared/enforced API context; contracts and audits are still necessary to govern actual third-party use.

Consent approval creates immutable terms and a scoped opaque grant UUID in a transaction; grant ID is not a bearer capability. Retrieval requires an access token with API audience and `address:read`, matching provider client, subject, active account/client, live nonexpired/nonrevoked consent/grant, selected location, requested purpose and field subset. A client-credentials token alone cannot read an individual's address. Return only selected fields with `Cache-Control: no-store`, never the entire decrypted payload. Owner operations require owner audience/scopes and cannot be performed by third-party tokens.

Use PostgreSQL live checks for every retrieval. Retrieval and revoke/update/delete lock the same grant/location authorization rows in a documented order. Revocation linearizes at commit: requests authorized before that commit may finish; requests authorized after it fail even with an unexpired token. Do not claim to retract bytes already in flight or copied. Location edits invalidate grants for the previous location version and require renewed consent; no silent sharing of a new home address. Account/client suspension blocks every path; a background provider revocation failure cannot restore API access.

Revoking consent revokes all related grants atomically. Deleting a location revokes its grants before payload deletion. Unlinking KitchenOS revokes its grants and ends PinID sessions where applicable; KitchenOS must remove its link locally. Optional webhook notifications are signed, retried and contain IDs only; they are not the authorization source of truth. Clients may already have copied information: show this limit and require deletion/retention commitments in client contracts.

## Versioned API proposal (not served in PR-00)

| Route | Policy |
| --- | --- |
| POST /api/v1/invitations | admin MFA and invitation-issue role; rate limited, token delivered once through verified channel |
| POST /api/v1/invitations/redeem | verified recipient plus single-use invitation; generic failures |
| GET /api/v1/identities/me | active owner; identity/aliases only |
| POST/DELETE /api/v1/identities/me/aliases[/:id] | owner, normalization and transactional uniqueness; tombstones |
| POST /api/v1/identities/:id/suspend | admin role; immediately disables access |
| GET /api/v1/identities/me/export | recent owner reauthentication; authenticated download, no-store |
| DELETE /api/v1/identities/me | recent reauthentication; revoke immediately and queue erasure |
| GET/POST /api/v1/locations | owner list/create |
| GET/PATCH/DELETE /api/v1/locations/:id | owner, row-version concurrency and confirmation |
| POST /api/v1/consent-requests | approved client; server validates purpose/fields and creates opaque request |
| POST /api/v1/consents | owner approves selected pending request; CSRF protected |
| GET /api/v1/consents | owner list |
| DELETE /api/v1/consents/:id | owner revokes associated grants |
| GET /api/v1/grants | owner list; client sees only its own grants |
| DELETE /api/v1/grants/:id | owner or matching approved client revokes |
| POST /api/v1/grants/:id/address | approved client with user-delegated token, live grant, purpose and field checks |

New OpenAPI document in PR-01 onward: UUID identifiers, strict allowlisted body schemas, bounded sizes, reject unknown fields, explicit security requirements and 401/403/404/409/422/429/503. Error envelope `{error:{code,message,request_id}}` with stable codes, no stack traces/record existence details; inaccessible resources return generic 404. List pagination is opaque cursor, owner-filtered, stable `(created_at,id)` order, default 20/max 100, including cursor ownership/context validation. Redis limits by caller/client/IP and action, not raw alias/email; trusted-proxy configuration must match actual topology. No PinID location values in URLs. Document retry/idempotency for create/redemption and optimistic conflicts. Do not publish these proposed endpoints as already available in Swagger.

## KitchenOS integration boundary

KitchenOS owns customers/orders/loyalty. PinID owns account/aliases/locations/consents/grants. KitchenOS stores `(iss, sub)` and only an allowed grant reference, not PinID credentials. Linking requires an existing authenticated KitchenOS customer, OIDC state/nonce/PKCE and explicit confirmation; never auto-link by email. Delivery selection creates a purpose-bound request, user chooses a location and approves expiry/fields, then KitchenOS retrieves narrowly scoped data. Snapshot only the delivery data needed for that order with its own disclosed retention. Handle denied/expired/revoked grants with reauthorization. Unlinking is idempotent and revokes grants; it does not delete the independent PinID identity. PR-04 must inspect and receive authorization before changing another repository; none has been inspected here.

## Review decisions and sources

Approve provider/issuer/provisioning, recipient verification and recovery policy, UUID subject mapping, encrypted DIGIPIN design, alias lifecycle/count limits, location-change reconsent, revocation linearization, hosting/KMS/backups, map provider, legal retention and operator identity. Acknowledge legacy defects before enabling a private vault; see release gates in the implementation plan.

DIGIPIN credit: Department of Posts, IIT Hyderabad and NRSC, ISRO. DHRUVA informs the personalized/federated addressing direction; it does not confer official affiliation or nationwide resolution. Sources inspected on 2026-10-13: [official DIGIPIN specification](https://github.com/INDIAPOST-gov/digipin/blob/main/docs/DIGIPIN_Technical_Document.md), [official source](https://github.com/INDIAPOST-gov/digipin/blob/main/src/digipin.js), [government DHRUVA description](https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=2147403&lang=2&reg=48), [Keycloak OIDC interfaces](https://www.keycloak.org/securing-apps/oidc-layers), [OAuth security BCP RFC 9700](https://www.rfc-editor.org/rfc/rfc9700).
