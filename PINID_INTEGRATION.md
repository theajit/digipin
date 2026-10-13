# Optional public PinID lookup

PR targets `digipin-ui`, not main or pinid. Adds only a standalone React PinIDResolver component to the existing branded UI. Existing encoding/decoding/Plus Code functions and API stay unchanged.

Default backend: https://name.pincode.cafe; override VITE_PINID_ORIGIN at build time for isolated testing only. Calls POST /api/resolve JSON {handle}, credentials omitted, no-store. PinID API must allow only this site's Origin on its public resolver and return only explicitly owner-shared coordinates/DIGIPIN. No labels, notes or contacts are requested. Private/nonexistent handles are indistinguishable. Errors clear old results; no persistent handle/location storage is added. No government address/identity verification claim.

Deploy the reviewed PinID sharing API before the UI. Current production CORS allows https://digipin.pincode.cafe exactly. Local synthetic QA used a fixture-specific localhost Origin, not a deployed setting. Actual local build `npm run build` passed; browser resolved synthetic ajit@pincode and verified failure after owner revocation. Screenshots/results are Git-ignored in the parent test-data/evidence directory; no live data used or deployment performed.

Rollback restores prior UI build; backend deployment is separate. Public addresses may already be copied by viewers. NO automatic merge/deploy; review API and UI PRs independently.
