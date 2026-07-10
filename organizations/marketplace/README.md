# Utopia Marketplace — Multipaz Demo

An end-to-end e-commerce demo of an online marketplace. Customers browse a grocery catalog across aisles (produce, bakery, dairy, pantry, beverages, and a **Beer, Wine & Spirits** aisle) and **authorize the purchase by presenting credentials** via the Multipaz verifier flow.

Checkout is **conditional per item**:

- **Everyday groceries** → a **payment credential only** (secure, private card presentment).
- **Age-restricted items** (the alcohol aisle) → a **digital identity credential** (mDL, EU PID, Aadhaar, etc.) **plus** payment. Age (≥ 18) is verified automatically during the credential check — no manual ID inspection, and the merchant never sees the date of birth.

> Part of the [multipaz-utopia](../../README.md) fictional-world demos.

---

## Module Layout

```
marketplace/
├── backend/    # Ktor/Netty server — verifier + /checkout API
└── frontend/   # Static HTML/CSS/JS storefront
```

### `backend`

Gradle project: `:multipaz-utopia:organizations:marketplace:backend`

| File | Purpose |
|---|---|
| `Main.kt` | Entry point — wires `DocumentTypeRepository`, `TrustManagerInterface`, and `MarketplaceVerifierAssistant` then starts the server |
| `ApplicationExt.kt` | Mounts verifier endpoints + the `/checkout` route |
| `MarketplaceHandler.kt` | `/checkout` request handler, the age-restricted and payment-only DCQL queries, `dcqlRequestsAge()`, and `MarketplaceVerifierAssistant` (conditional age-check + payment logic) |
| `MarketplaceCatalog.kt` | Server-authoritative product catalog — `/checkout` looks up price and the age-restricted flag here by `productId` rather than trusting them from the request body |

**Server port:** `8010`  
**URL prefix (behind nginx):** `/marketplace/`

### `frontend`

Gradle project: `:multipaz-utopia:organizations:marketplace:frontend`

Static resources served directly from the backend classpath (copied via `processResources`):

| File | Purpose |
|---|---|
| `catalog.js` | **Source of truth** for the storefront — the product list (with per-item `ageRestricted` flag), the aisle order, and the inline `tile()` image generator, shared by both pages |
| `index.html` | Renders the catalog grouped into aisle sections (age-restricted items carry an `18+` badge) |
| `product.html` | Product detail + checkout flow |
| `marketplace.css` | Storefront styles |
| `marketplace.js` | Product-detail rendering + checkout orchestration — calls `/checkout` with the `productId`, drives `multipazVerifyCredentials()` |

Product images are generated inline by `catalog.js` (`tile()`) as self-contained SVG data URIs — a category-tinted gradient with the product's emoji — so there are no binary image assets to ship.

---

## How It Works

```
Browser                          Marketplace Backend              Wallet App
  │                                    │                           │
  │  POST /checkout                    │  look up product by id    │
  │  { productId }           ────────► │  (price + age flag);      │
  │                                    │  pick DCQL by its         │
  │  { dcql, protocols,         ◄───── │  ageRestricted flag       │
  │    transaction_data }               │                           │
  │                                    │                           │
  │  multipazVerifyCredentials()        │                           │
  │  (QR / deep-link) ────────────────────────────────────────────►│
  │                                    │                           │
  │                                    │ ◄── credential response ──│
  │                                    │  age-check (if needed)    │
  │                                    │  + commit payment         │
  │  { approved / declined } ◄──────── │                           │
```

1. The user taps **Add to Cart & Check Out** on a product page.
2. `marketplace.js` POSTs `{productId}` to `/checkout`.
3. The backend looks the id up in its server-side catalog (`MarketplaceCatalog.kt`) to get the
   authoritative price and age-restricted flag, then picks the DCQL by that flag:
   - `false` → **`PAYMENT_ONLY_DCQL_QUERY`** (just the `payment` credential).
   - `true` → **`MARKETPLACE_DCQL_QUERY`** (an identity/age credential option **and** payment).

   It embeds a payment transaction (for the catalog price) in `transaction_data`.
4. The browser passes `dcql`, `protocols`, and `transaction_data` to `multipazVerifyCredentials()` which displays a QR code / deep-link for the wallet. The `protocols` field (set to `["openid4vp-v1-signed"]`) ensures the OpenID4VP flow is used — required for transaction data to be properly signed and verified end-to-end.
5. The wallet presents the credential(s). `MarketplaceVerifierAssistant` inspects the request's DCQL via `dcqlRequestsAge()`: if an identity/age credential was requested it verifies age (≥ 18); it always commits the payment.
6. The browser receives an approved/declined result and shows the outcome to the user.

---

## Age Verification Logic

Age verification runs **only for age-restricted items** — when the checkout DCQL requested an identity/age credential (`dcqlRequestsAge()` returns true). For those, `MarketplaceVerifierAssistant` checks the following claims in priority order:

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
./gradlew multipaz-utopia:organizations:marketplace:backend:run
```

The server starts on `http://localhost:8010`. Open `http://localhost:8010/` in your browser to see the storefront.

### Wallet on Android/iOS device

When the wallet runs on a different device, `localhost` points to that device (not your Mac), so pass a reachable `base_url` at runtime:

```bash
./gradlew multipaz-utopia:organizations:marketplace:backend:run \
  -PmarketplaceBaseUrl=http://<your-mac-lan-ip>:8010
```

Example:

```bash
./gradlew multipaz-utopia:organizations:marketplace:backend:run \
  -PmarketplaceBaseUrl=http://192.168.1.7:8010
```

### Wallet on Android emulator

Use the emulator host alias:

```bash
./gradlew multipaz-utopia:organizations:marketplace:backend:run \
  -PmarketplaceBaseUrl=http://10.0.2.2:8010
```

### Running Inside Docker (full stack)

```bash
./gradlew collectDependencies
./gradlew buildDockerImage
./gradlew runDockerImage
```

The marketplace site will be available at `http://localhost:8000/marketplace/`.

---

## Payment Transaction

Checkout does not define a custom transaction type. It calls the payment processor over RPC —
`PaymentProcessor.createTransaction(PaymentTransactionRequest(...))` — and embeds the result as a
standard **`PaymentTransaction`** (`org.multipaz.documenttype.knowntypes.PaymentTransaction`) entry
in the `transaction_data` array sent to the wallet:

| Field | Source | Example |
|---|---|---|
| `type` | `PaymentTransaction.identifier` | `"urn:eudi:sca:payment:1"` |
| `credential_ids` | fixed | `["payment"]` |
| `transaction_id` | payment processor | (opaque handle) |
| `payee` | `{ name, id }` — `id` is the configured `payee_account` | `{ "name": "Utopia Marketplace", "id": "10000001" }` |
| `amount` | catalog price for the `productId` | `42.00` |
| `currency` | fixed | `"USD"` |

The payload is round-tripped through the device-signed namespace so the verifier can confirm the
holder authorized this exact transaction. After the wallet responds, `MarketplaceVerifierAssistant`
commits it via `PaymentProcessor.commitTransaction(...)`.
