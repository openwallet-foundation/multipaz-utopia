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
├── backend/    # Ktor/Netty server — verifier + /checkout API + cart checkout + page routes
├── frontend/   # Static HTML/CSS/JS storefront (+ checkout.html/js for the MCP flow)
└── mcp/        # Node/TS agentic MCP storefront (CredentAgent) — hands off to UPay/DPC
```

### `backend`

Gradle project: `:multipaz-utopia:organizations:marketplace:backend`

| File | Purpose |
|---|---|
| `Main.kt` | Entry point — wires `DocumentTypeRepository`, `TrustManagerInterface`, and `MarketplaceVerifierAssistant` then starts the server |
| `ApplicationExt.kt` | Mounts verifier endpoints + the checkout routes (`/checkout`, `/checkout/order`, `/checkout/complete`, `/checkout/order-status`) |
| `MarketplaceHandler.kt` | Single-product `/checkout` and cart `/checkout/order` handlers, the age-restricted and payment-only DCQL queries, `dcqlRequestsAge()`, and `MarketplaceVerifierAssistant` (conditional age-check + payment logic) |
| `MarketplaceCatalog.kt` | Server-authoritative product catalog — checkout looks up price and the age-restricted flag here by `productId` rather than trusting them from the request body |
| `MarketplaceCheckoutStatus.kt` | The MCP checkout page redirect + `/checkout/complete` and `/checkout/order-status` (backs the storefront widget's completion poll) |

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
| `checkout.html` / `checkout.js` | Cart-aware checkout page for the `mcp/` storefront — fetches the order from the MCP server, then posts the cart to `/checkout/order` and runs the same UPay/DPC `multipazVerifyCredentials()` flow |

Product images are generated inline by `catalog.js` (`tile()`) as self-contained SVG data URIs — a category-tinted gradient with the product's emoji — so there are no binary image assets to ship.

### `mcp`

Node/TypeScript module whose npm build is driven from Gradle
(`:organizations:marketplace:mcp:bundle`, which is what the container image consumes). An agentic MCP
storefront built on [`@openmobilehub/credentagent-storefront`](https://github.com/openmobilehub/credentagent):
an AI agent (Claude, ChatGPT, Goose, Claude Code) browses the catalog and builds a
cart, and **checkout hands off** to this backend's UPay + Digital Payment Credential
ceremony. The `checkout` tool returns a link to `GET /checkout`; the page re-prices
the cart server-side via `POST /checkout/order` and runs `multipazVerifyCredentials()`
(payment DPC, plus an age credential when the cart holds an age-restricted item).

Its catalog mirrors `MarketplaceCatalog.kt` / `catalog.js` (same ids, prices, and
age-restricted flags). See [`mcp/README.md`](mcp/README.md).

Run the MCP server (needs the records/enrollment + UPay + marketplace backend up):

```bash
cd mcp && npm install && MARKETPLACE_CHECKOUT_ORIGIN=http://localhost:8010 npm run dev
# → http://localhost:3005/mcp  (add as a custom connector in Claude / ChatGPT / Goose)
```

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
./gradlew :organizations:marketplace:backend:run
```

The server starts on `http://localhost:8010`. Open `http://localhost:8010/` in your browser to see the storefront.

`:runFatJar` runs the same server from a self-contained jar instead, and `:buildFatJar` produces `backend/build/libs/backend-all.jar` for `java -jar` — see [Ways to run a server](../../README.md#ways-to-run-a-server). Both work with no arguments because of the defaults below.

Browsing works on its own, but **checkout needs the Registry** running on `http://localhost:8004`: `/checkout` opens the payment transaction through the payment processor that lives there, and the backend trusts only that server's IACA root when it verifies the wallet's credentials. Start it — and the issuers whose credentials you intend to present — as described in the [root README](../../README.md#running-locally).

### Configuration

The backend ships its defaults in [`backend/src/main/resources/resources/default_configuration.json`](backend/src/main/resources/resources/default_configuration.json), so no arguments are needed for a local run:

| Key | Default | Meaning |
|---|---|---|
| `server_port` | `8010` | Port the storefront and verifier endpoints are served on |
| `payee_account` | `10000001` | Merchant account purchases are paid into. Must exist in the Registry that processes the payment |
| `enrollment_server_url` | `http://localhost:8004` | Registry — IACA root to trust plus the payment processor `/checkout` calls |
| `ca_trust_servers` | `*.multipaz.org/**`, `sorotokin.com/**` | Servers whose credentials are trusted |

Override any of them with `--args="-param <key>=<value>"`, for example to bill a different merchant account or point at a Registry elsewhere:

```bash
./gradlew :organizations:marketplace:backend:run \
  --args="-param payee_account=10000002 -param enrollment_server_url=http://192.168.1.7:8004"
```

The same parameters go straight to the fat jar, which is the way to override anything when running outside Gradle:

```bash
java -jar backend/build/libs/backend-all.jar -param payee_account=10000002
```

### Wallet on Android/iOS device

When the wallet runs on a different device, `localhost` points to that device (not your Mac), so pass a reachable `base_url` at runtime:

```bash
./gradlew :organizations:marketplace:backend:run \
  -PmarketplaceBaseUrl=http://<your-mac-lan-ip>:8010
```

Example:

```bash
./gradlew :organizations:marketplace:backend:run \
  -PmarketplaceBaseUrl=http://192.168.1.7:8010
```

`-PmarketplaceBaseUrl` is wired into the `run` task only; with the fat jar, pass `-param base_url=…` instead.

The wallet must be able to reach the Registry too, so start that one with a matching `base_url` (`--args="-param base_url=http://192.168.1.7:8004"`) and point the marketplace at it with `-param enrollment_server_url=http://192.168.1.7:8004`.

### Wallet on Android emulator

Use the emulator host alias:

```bash
./gradlew :organizations:marketplace:backend:run \
  -PmarketplaceBaseUrl=http://10.0.2.2:8010
```

### Running Inside Docker (full stack)

The container bundle runs every Utopia server behind nginx, which saves wiring the services together by hand:

```bash
./gradlew :deployment:buildDockerImage
podman run --rm -p 8100:8100 multipaz-utopia/server-bundle:latest
```

The marketplace site is then at `http://localhost:8100/marketplace/`, and its Registry is seeded with the demo identities from `deployment/docker/init/records.json` — including the `10000001` merchant account. See [deployment/README.md](../../deployment/README.md) for architecture-specific builds and deployment.

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
