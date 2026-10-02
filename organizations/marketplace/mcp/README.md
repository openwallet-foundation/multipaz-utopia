# Utopia Marketplace — MCP Storefront

An **MCP storefront** for the Utopia Marketplace: an AI agent (Claude, ChatGPT, Goose) browses the
catalog, builds a cart, and checks out — and the payment is a **real, issuer-verified Multipaz
credential settled by UPay**, not a mock.

It is an **additional front door** onto the existing marketplace, not a replacement: the human web
storefront keeps working exactly as before.

Built on [CredentAgent](https://github.com/openmobilehub/credentagent). This module wires up **both
of its halves**, plus one piece of our own:

| | What it gives us |
|---|---|
| **`credentagent-storefront`** | The shopping surface: catalog, cart, the MCP tools, the checkout page. |
| **`credentagent-gate`** | The consent layer: the policy (`age.over(18)`, `payment.in("usd")`), the mounted ceremony rails, and the checks that decide whether a purchase may complete. |
| **`verifier.ts`** (ours) | A host-side adapter implementing the gate's `DelegatedVerifier` seam, so the real Multipaz + UPay backend does the verifying and settling. |

The gate is the part that makes this safe to hand off. It never trusts the verifier's word alone:
it re-derives the amount from its own catalog, re-checks that against what the wallet signed,
re-runs its own age policy over the disclosed claims, and only then authorizes settlement.

---

## How it works

```
Claude ──MCP──► storefront ──► checkout link ──► buyer's phone
                                                      │
                          gate rails the buyer walks: │
                            /credentagent/credential  ├─ 1. age      → wallet presents an mDL
                            /credentagent/delegated   └─ 2. payment  → wallet presents a card (DPC)
                                     │
                                     │  verifier.ts (our adapter)
                                     ▼
              /delegated/{request,result,settle}  →  Marketplace backend (Kotlin)
                                                     ├─ UPay createTransaction
                                                     ├─ TrustManager.verify  (issuer trust)
                                                     └─ UPay commitTransaction
```

**Verification and settlement are two separate steps.** `consume` verifies and moves no money; the
gate then re-checks the binding and its own policy, and only then calls `settle`. A purchase the
policy refuses never gets charged — which is the whole reason the split exists.

The gate also ships a `membership.discount()` rail, deliberately **not** wired here. It asks for
`org.multipaz.loyalty.1` and accepts it on presence alone — no issuer trust anchor — and Utopia
issues no loyalty credential at all, so any loyalty card from any issuer would discount a payment
that really settles. Every requirement this storefront asks for is one the stack can vouch for.

Wiring the whole thing is three lines (`server.ts`):

```ts
const store = createStorefront({ catalog, verifier });          // storefront + the seam
const credentagent = new CredentAgent({ credentials: [ageCred, payCred] });
credentagent.mount(store.app);                                  // gate mounts its rails
store.gate((order) => credentagent.requirements(order, [...])); // policy on checkout
```

Swapping the backend is the `verifier` argument alone — the policy above stays byte-identical.

---

## Quick start (stand-in verifier)

No wallet, no phone. Uses a stand-in verifier so the flow is clickable end-to-end. The catalog
comes from the marketplace backend, so start it first:
`./gradlew :organizations:marketplace:backend:run` (serves `GET /catalog` on `:8010`).

```bash
npm install
npm run dev:demo
```

Then open:

| URL | What it shows |
|---|---|
| `http://localhost:3005/dev/buy` | Bourbon (18+) → age, then payment |
| `http://localhost:3005/dev/buy?item=p1` | Apples → payment only |
| `http://localhost:3005/dev/ledger?account=10000001` | Live balance + settlements |

Watch the gate refuse a misbehaving verifier — each of these is rejected **before** any settlement:

```bash
VERDICT=wrong-amount npm run dev:demo   # verifier reports the wrong amount
VERDICT=underage     npm run dev:demo   # claims don't meet the age threshold
VERDICT=declined     npm run dev:demo   # untrusted card issuer
```

> The stand-in reports `trust_level: "presence-only-demo"` — nothing is really verified and no
> money moves. It exists to exercise the flow, not to prove trust.

---

## Real payments (Multipaz + UPay)

Needs the Utopia stack running, and a phone with the
[Multipaz Wallet](https://apps.multipaz.org/multipaz-wallet-dev/) holding credentials issued by
*that* stack instance.

**1. Start the stack** (from the repo root):

```bash
./gradlew :deployment:buildDockerImage
podman run --rm -p 8100:8100 -e BASE_URL=http://localhost:8100 -e ADMIN_PASS=multipaz \
  -v "$HOME/utopia-data:/app/data:z" localhost/multipaz-utopia/server-bundle:latest
```

The image already bundles this MCP module, so it is served at `http://localhost:8100/mcp` — for a
deployed setup you are done.

**2. Or run the MCP from source** against that stack:

```bash
MARKETPLACE_KOTLIN_BASE=http://localhost:8100/marketplace \
MARKETPLACE_VERIFIER_BASE=/marketplace \
npm run dev:demo
```

**3. Issue credentials** to the wallet from the same instance. The issuer pages build themselves
from metadata, so the quickest route is the offer link directly:

| | |
|---|---|
| Payment card | `http://localhost:8100/bank_of_utopia/?config_id=payment_sca_mdoc&url_schema=openid-credential-offer` |
| mDL | `http://localhost:8100/dmv/?config_id=mDL&url_schema=openid-credential-offer` |

Trust is per-instance: a card issued by another stack — or by this one before its origin changed —
is rejected as untrusted.

---

## Testing from a phone / Claude mobile

Two things force a public HTTPS origin: Claude's connector requires HTTPS, and the wallet ceremony
is **origin-bound** — the checkout page and the Multipaz verifier must share one origin.

### 1. Open a tunnel

```bash
cloudflared tunnel --url http://localhost:8100     # → https://<name>.trycloudflare.com
```

Check that your own machine can resolve the name it printed:

```bash
dig +short <name>.trycloudflare.com
```

**Empty answer?** Your resolver doesn't serve Cloudflare's quick-tunnel subdomains — some ISPs
don't, and then nothing works, on the laptop or the phone. Use localhost.run instead: it runs over
SSH, so there is nothing to install and no account to create.

```bash
ssh -R 80:localhost:8100 nokey@localhost.run       # → https://<id>.lhr.life
```

### 2. Reset the trust roots

**The step that is easy to miss.** The stack ties its issuer trust root to the origin in `BASE_URL`.
Change the origin and every credential already in the wallet becomes untrusted — which shows up at
checkout as **"Refused: gates"**, with `trusted=false` in `logs/marketplace.log`. Clear the
origin-bound material first; the payment ledger and accounts are not touched.

```bash
sqlite3 ~/utopia-data/registry.db \
  "DELETE FROM MzIssuedCertificates; DELETE FROM MzRootSigningKeyData;"
for d in bank_of_utopia marketplace dmv; do
  sqlite3 ~/utopia-data/$d.db "DELETE FROM MzEnrollments;"
done
```

### 3. Start the stack on that origin

```bash
podman run -d --name utopia -p 8100:8100 --dns 8.8.8.8 \
  -e BASE_URL=https://<your-tunnel-host> -e ADMIN_PASS=multipaz \
  -v "$HOME/utopia-data:/app/data:z" localhost/multipaz-utopia/server-bundle:latest
```

Then confirm the container can reach *itself* through the public URL. If this isn't `200`, issuing
credentials fails with a `ConnectException`, because the services load their trust root over that
same URL:

```bash
podman exec utopia curl -s -o /dev/null -w '%{http_code}\n' https://<your-tunnel-host>/health
```

### 4. Re-issue the credentials

Delete the old ones from the wallet first — they were signed by the root you just cleared. Then open
these on the phone:

| | |
|---|---|
| Payment card | `https://<host>/bank_of_utopia/?config_id=payment_sca_mdoc&url_schema=openid-credential-offer` |
| mDL | `https://<host>/dmv/?config_id=mDL&url_schema=openid-credential-offer` |

### 5. Add the connector

Add `https://<your-tunnel-host>/mcp` as a custom connector in Claude, then shop by chat.

**If the checkout link won't open on the phone**, the phone has to resolve the tunnel host too. Use
cellular data, or set the phone's private DNS to `dns.google`. Don't reach for `one.one.one.one` —
on some networks 1.1.1.1 doesn't answer at all, which is worse than the resolver you started with.

Quick tunnels get a new URL on every restart, and a new URL means redoing steps 2–4.

---

## Environment variables

Copy `.env.example` to `.env`. Everything has a working local default.

**Real payments**

| Variable | Purpose |
|---|---|
| `MARKETPLACE_KOTLIN_BASE` | Marketplace backend for the delegated verifier. **Unset ⇒ stand-in verifier** (nothing is real). |
| `MARKETPLACE_VERIFIER_BASE` | Browser-facing base serving `verify_credentials.js`. Must be same-origin with the checkout page — normally `/marketplace`. |
| `MARKETPLACE_CATALOG_URL` | Catalog endpoint. Default: `MARKETPLACE_KOTLIN_BASE` + `/catalog`, else `http://localhost:8010/catalog`. |
| `MARKETPLACE_CATALOG_TTL_MS` | How long the fetched catalog is cached (default `60000`). A failed refresh keeps serving the last good copy. |

**Server**

| Variable | Purpose |
|---|---|
| `MCP_PORT` | Listen port (default `3005`). The connector URL is `<origin>/mcp`. |
| `MCP_BASE_URL` | Public origin for checkout links. Set to the tunnel URL when the buyer is off-device. |
| `MARKETPLACE_AGE` | Age threshold (default `18`). See the note below. |

**Dev harness only** (`npm run dev:demo`)

| Variable | Purpose |
|---|---|
| `MARKETPLACE_KOTLIN_UPSTREAM` | Upstream that `/marketplace`, `/registry`, `/upay` are proxied to, so everything is same-origin locally. |
| `MARKETPLACE_LEDGER_ACCOUNT` | Account `/dev/ledger` shows. |
| `MCP_ORDERS_FILE` / `MCP_COMPLETED_ORDERS_FILE` | Where orders persist, so a restart doesn't invalidate a checkout link or forget a purchase. |
| `VERDICT` | Stand-in verdict: `ok` \| `wrong-amount` \| `underage` \| `declined`. |

> `MARKETPLACE_AGE` alone does not raise the age actually enforced: the delegated age re-check
> reads the threshold from the order's catalog `minimumAge`, which `catalog.ts` sets to 18 for
> every product the backend marks `ageRestricted`.

---

## Layout

```
src/
  main.ts        entry point — what the deployed image runs
  server.ts      storefront + gate wiring, and the policy
  verifier.ts    the DelegatedVerifier adapter (real Multipaz/UPay + the stand-in)
  catalog.ts     fetches + caches the backend's GET /catalog as CredentAgent products
  orderStore.ts  file-backed order persistence
  dev-serve.ts   dev harness: /dev/buy, /dev/ledger, same-origin proxy — NOT shipped
```

```bash
npm run typecheck
npm test
```

---

## Status

The CredentAgent packages are consumed from npm — `credentagent-gate` and
`credentagent-storefront`, at the version pinned in `package.json` (0.4.0 or later, the first
release carrying the delegated-verifier seam this module builds on). `npm install` needs nothing but
a registry, so every command in this README works on a clean checkout.

What is still outstanding is hosting: the flow is exercised against a locally built stack, because
the marketplace routes it needs do not exist on `utopia.multipaz.org` until the image is deployed
there. See [#20](https://github.com/openwallet-foundation/multipaz-utopia/issues/20) (no CI/CD) and
[#22](https://github.com/openwallet-foundation/multipaz-utopia/issues/22) (single-VM deployment).

Tracked in [multipaz-utopia#16](https://github.com/openwallet-foundation/multipaz-utopia/issues/16).
