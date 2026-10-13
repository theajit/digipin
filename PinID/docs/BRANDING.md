# PinID in the Pin Code Café family

Inspected the live HTML and CSS of https://digipin.pincode.cafe and https://cult.pincode.cafe on 2026-10-13. These observations are references, not a claim that PinID has been deployed alongside them.

| Reference | Observed direction | PinID use |
| --- | --- | --- |
| DIGIPIN | café logo, warm #fffdf8 paper, #171717 ink, #f47b20 orange, bordered tools, serif headline emphasis | local café logo, orange address-ticket accent, black actions and warm surfaces |
| 194.194 Cult | #f1eee5 paper, #171714 ink, large dense type, Georgia italic emphasis, sharp borders, #d8ff35 lime community accents, ecosystem links | bold/italic hierarchy, numbered sections, crisp cards and ecosystem navigation |

PinID remains its own product: `PinID — Your private address`, not a government verification service or a Cult membership system. Hero message: `One name. Your place.` The UI gives the café brand a clear home link and lets users discover DIGIPIN/Cult without sharing their location. External links use noreferrer, and the vault's no-referrer policy remains enabled.

No third-party font/image scripts are loaded. The café logo is copied from the existing DIGIPIN UI asset and served locally. System Arial/Helvetica and Georgia maintain the references' typographic direction without leaking browser requests to a font provider. No India Post logo is used as the PinID identity mark; technical attribution remains in the footer and privacy notice.

The self-contained source tree lives under `PinID/`, serving its UI at `/` and private API at `/api`. Its old `/pinid/api` prefix remains a compatibility alias. The root DIGIPIN server stays independent. Generated records, secrets and screenshots stay in Git-ignored root or PinID `test-data/`. Existing PinID records/keys require no schema change or re-encryption for this separation; migration checksums and crypto AAD/version identifiers remain unchanged.
