# PinID task interface

The public page groups lookup, invitation requests, enrollment and sign-in into keyboard-accessible tabs. The owner dashboard and administrator invitation desk use larger labels, controls and plain-language instructions. Pin Code Café colours and local assets remain; no external fonts or analytics were added. The administrator link is removed from the public footer; `/admin.html` still requires administrator authentication. Hiding the link is not an authorization control.

## DIGIPIN coordinates

`POST /api/tools/decode` accepts JSON `{ "digipin": "4P3-JK8-3M28" }` from the configured PinID origin. Spaces, hyphens and lowercase are normalized. The canonical result is `{ "digipin": "4P3JK83M28", "latitude": 12.972563, "longitude": 77.592009, "precision": "grid-centre" }`. These are grid-centre coordinates, not a recovered exact original GPS position. This independent PinID utility uses its attributed local official engine. The original DIGIPIN app and legacy encode/decode routes are unchanged.

No authentication is needed to decode a geographical code. This route never queries private locations, identities or address notes. It uses exact-origin checks, JSON validation, no-store responses and the existing persisted rate limiter: 10 attempts per peer and 60 globally per 10 minutes. Errors include `INVALID_DIGIPIN` (400), unknown body fields (400), `ORIGIN_REJECTED` (403), `JSON_REQUIRED` (415) and `RATE_LIMITED` (429). Cross-origin browser access is not enabled for this utility.

Find a place accepts a public PinID or DIGIPIN. Location editors can fill coordinates from a DIGIPIN; filling does not save or confirm the location. GPS and manual input remain available. Editing coordinates clears confirmation. Existing owner authentication, CSRF, encryption and opt-in public sharing remain enforced by the API. Address notes stay private even when sharing is enabled.

## Migration, deployment and rollback

No schema migration, environment change or new runtime dependency is required. After review, use the existing direct Node deployment with working directory `PinID`, `npm ci --ignore-scripts`, and `npm start`. PostgreSQL/SQLite storage requirements are unchanged. Verify `/healthz`, DIGIPIN lookup and owner sign-in with non-production records before release. Roll back by redeploying the prior application commit; databases do not need rollback. No production deployment or data movement was performed for this change.

## Verification

Executed locally with Node 24.20: syntax checks; SQLite regression suite (42 passed, PostgreSQL suite skipped); full suite with disposable PostgreSQL 18 (60 passed, zero skipped). The utility test covers official coordinates, formatting, invalid input, unknown fields, Origin/JSON denial, unauthenticated owner denial, missing public administrator link and rate limits. Existing encryption, replay/race, BOLA, CSRF, migration, outage and restart tests remain in the full suite.

Actual running-page evidence uses synthetic records only under ignored `test-data/evidence/`: lookup, invitation request, enrollment DIGIPIN selection with confirmation unchecked, owner dashboard, administrator desk and mobile layout. This evidence proves local UI behavior, not production deployment or durable hosting. GPS permission/accuracy, assistive-technology usability and testing with users of different ages remain unverified. The interface is English-only.
