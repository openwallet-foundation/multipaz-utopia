# Utopia app-release directory

This directory seeds the runtime APK catalog in the container at `/app/downloads`. In production,
mount a persistent VM directory over that path; do not upload APKs into this Git checkout.

`releases.json` controls the cards on `/apps/`. A card is listed as `pending` until it has a
release URL. Once an APK is published, replace its pending fields with release metadata:

```json
{
  "id": "utopia-pos",
  "name": "Utopia POS Terminal",
  "description": "Merchant terminal app for Utopia payment demonstrations.",
  "platform": "Android",
  "version": "e95c924",
  "releasedAt": "2026-10-28",
  "minAndroid": 29,
  "size": "18.4 MB",
  "apkUrl": "/downloads/utopia-pos/e95c924/utopia-pos.apk",
  "sha256": "lowercase hexadecimal SHA-256",
  "signingCertificate": "SHA-256 certificate fingerprint"
}
```

For a browser app, use `webUrl` instead of `apkUrl`. Do not add `status: "pending"` to a
published entry.

For an app maintained by the upstream Multipaz team, use `externalUrl` instead of a Utopia-hosted
artifact URL. The catalog labels it as upstream-maintained and links visitors to that external
catalog; Utopia does not mirror or release that APK.

Upload APKs at a new, commit-keyed directory (`<id>/<short-commit-sha>/`) with a sibling `.sha256` file,
verify the remote checksum, and only then update `releases.json`. The `.gitignore` prevents APKs
from being committed accidentally.
