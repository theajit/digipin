# PinID repository working conventions

- Put generated test records, disposable credentials, databases, captured logs and screenshots under root `/test-data/` or standalone `/PinID/test-data/`. Both must remain Git-ignored. Never use production data in them.
- Keep executable tests and published reference vectors tracked; generated/private test artifacts are separate from test source.
- For each completed UI/checklist item, show screenshot evidence from the actual running page. Backend/security items need executed assertions as well; label screenshots of test/API reports accurately.
- Save local screenshots under `test-data/evidence/`, keep credentials out of screenshots, and state unverified items. Do not claim local evidence proves production deployment or host durability.
- Use direct Node deployment for PinID Lite; do not add Docker unless explicitly requested.
- PinID implementation is self-contained under `/PinID/`, with its own server, dependencies, lockfile and locally attributed DIGIPIN engine. Do not import or mount it from the root DIGIPIN app. Maintain the Pin Code Café visual family and local assets without external font/analytics requests from the vault.
