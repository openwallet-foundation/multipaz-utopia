# Utopia Brewery — Multipaz Demo

An end-to-end e-commerce demo where customers browse a craft spirits catalog, add items to their cart, and **authorize the purchase by presenting a digital identity credential** (mDL, EU PID, Aadhaar, etc.) via the Multipaz verifier flow. Age is verified automatically during the credential check — no manual ID inspection required.

> Part of the [multipaz-utopia](../../README.md) fictional-world demos.

---

## Module Layout

```
brewery/
├── backend/    # Ktor/Netty server — verifier + /checkout API
└── frontend/   # Static HTML/CSS/JS storefront
```

### `backend`

Gradle project: `:multipaz-utopia:organizations:brewery:backend`

| File | Purpose |
|---|---|
| `Main.kt` | Entry point — wires `DocumentTypeRepository`, `TrustManagerInterface`, and `BreweryVerifierAssistant` then starts the server |
| `ApplicationExt.kt` | Mounts verifier endpoints + the `/checkout` route |
| `BreweryHandler.kt` | `/checkout` request handler and `BreweryVerifierAssistant` (age-check logic, DCQL builder, records stub) |

**Server port:** `8010`  
**URL prefix (behind nginx):** `/brewery/`

### `frontend`

Gradle project: `:multipaz-utopia:organizations:brewery:frontend`

Static resources served directly from the backend classpath (copied via `processResources`):

| File | Purpose |
|---|---|
| `index.html` | Product catalog grid |
| `product.html` | Product detail + "Buy" checkout flow |
| `brewery.css` | Storefront styles |
| `brewery.js` | Checkout orchestration — calls `/checkout`, drives `multipazVerifyCredentials()` |
| `images/` | Product photography (bourbon, gin, rum, scotch, vodka, rye, pour, distillery) |

---

## How It Works

```
Browser                          Brewery Backend              Wallet App
  │                                    │                           │
  │  POST /checkout                    │                           │
  │  { productName, price }  ────────► │                           │
  │                                    │  build DCQL +             │
  │  { dcql, protocols,         ◄───── │  BreweryPurchaseTransaction│
  │    transaction_data }               │                           │
  │                                    │                           │
  │  multipazVerifyCredentials()        │                           │
  │  (QR / deep-link) ────────────────────────────────────────────►│
  │                                    │                           │
  │                                    │ ◄── credential response ──│
  │                                    │  age-check + sign         │
  │  { approved / denied } ◄────────── │                           │
```

1. The user taps **Buy** on a product page.
2. `brewery.js` POSTs `{productName, price}` to `/checkout`.
3. The backend builds a DCQL request scoped to the `payment` credential ID, embedding a `BreweryPurchaseTransaction` in `transaction_data`.
4. The browser passes `dcql`, `protocols`, and `transaction_data` to `multipazVerifyCredentials()` which displays a QR code / deep-link for the wallet. The `protocols` field (set to `["openid4vp-v1-signed"]`) ensures the OpenID4VP flow is used — required for transaction data to be properly signed and verified end-to-end.
5. The wallet presents the credential; the backend's `BreweryVerifierAssistant` verifies age (≥ 18) and signs off on the transaction.
6. The browser receives an approved/denied result and shows the outcome to the user.

---

## Age Verification Logic

`BreweryVerifierAssistant` checks the following claims in priority order:

| Priority | Claim | Type | Credential(s) | Notes |
|---|---|---|---|---|
| 1 | `age_over_18` | Boolean | mDL, EU PID, PhotoID | Definitive — `false` means under 18 |
| 2 | `age_above18` | Boolean | Aadhaar | Definitive — `false` means under 18 |
| 3 | `age_over_21` | Boolean | mDL, EU PID | Positive signal only — `true` implies ≥ 18; `false` is inconclusive (a 20-year-old has `age_over_21=false` yet is over 18) |
| 4 | `age_in_years` | Integer ≥ 18 | mDL, EU PID | |
| 5 | `birth_date` | ISO date string | all | Calculated against current UTC date |

Supported credential types: `photoid`, `mdl`, `eupid`, `aadhaar`.

---

## Running Locally

### Browser-only (desktop)

```bash
./gradlew multipaz-utopia:organizations:brewery:backend:run
```

The server starts on `http://localhost:8010`. Open `http://localhost:8010/` in your browser to see the storefront.

### Wallet on Android/iOS device

When the wallet runs on a different device, `localhost` points to that device (not your Mac), so pass a reachable `base_url` at runtime:

```bash
./gradlew multipaz-utopia:organizations:brewery:backend:run \
  -PbreweryBaseUrl=http://<your-mac-lan-ip>:8010
```

Example:

```bash
./gradlew multipaz-utopia:organizations:brewery:backend:run \
  -PbreweryBaseUrl=http://192.168.1.7:8010
```

### Wallet on Android emulator

Use the emulator host alias:

```bash
./gradlew multipaz-utopia:organizations:brewery:backend:run \
  -PbreweryBaseUrl=http://10.0.2.2:8010
```

### Running Inside Docker (full stack)

```bash
./gradlew collectDependencies
./gradlew buildDockerImage
./gradlew runDockerImage
```

The brewery site will be available at `http://localhost:8000/brewery/`.

---

## Transaction Type

The `BreweryPurchaseTransaction` (defined in `multipaz-utopia` shared module) carries four fields through the credential presentation flow:

| Field | Type | Example |
|---|---|---|
| `merchant` | String | `"Utopia Brewery"` |
| `description` | String | `"Aged Bourbon Whiskey"` |
| `amount` | String | `"72.00"` |
| `currency` | String | `"USD"` |

These fields are round-tripped in the device-signed namespace so the verifier can confirm the holder authorized the exact transaction.
