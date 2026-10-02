// Dev/demo harness (NOT shipped): boot the marketplace MCP storefront with an injected
// created-order store and a `/dev/buy` convenience route that mints an order and drops straight
// into the mounted delegated ceremony — so the delegated rail is clickable in a browser without
// an MCP client. Mirrors credentagent's examples/delegated-verifier/serve.mjs.
//
//   npm run dev:demo                         # → http://localhost:3005
//   open http://localhost:3005/dev/buy             # Old Oak Bourbon (18+) → age, then payment
//   open http://localhost:3005/dev/buy?item=p1     # apples → payment only
//
// Catalog: fetched from the marketplace backend's GET /catalog (MARKETPLACE_CATALOG_URL, else
// MARKETPLACE_KOTLIN_BASE + /catalog, else http://localhost:8010/catalog) — so the backend must be
// running even for the stand-in verifier.
//
// Verifier: LOCAL STAND-IN by default (presence-only-demo). Set MARKETPLACE_KOTLIN_BASE
// to drive the real Multipaz + UPay backend, and VERDICT=wrong-amount|underage|declined to watch
// the gate refuse a misbehaving verifier before any (simulated) money moves.
import type { Order } from "@openmobilehub/credentagent-storefront";
import type { CompletedOrderRecord } from "@openmobilehub/credentagent-storefront/server";
import { createProxyMiddleware, fixRequestBody } from "http-proxy-middleware";
import { buildStore } from "./server.js";
import { FileOrderStore, completedOrdersFile, createdOrdersFile } from "./orderStore.js";

const PORT = Number(process.env.MCP_PORT ?? 3005);

const createdOrderStore = new FileOrderStore<Order>(createdOrdersFile());
const completedOrderStore = new FileOrderStore<CompletedOrderRecord>(completedOrdersFile());

// MCP_BASE_URL lets a tunnel (e.g. cloudflared) set the public origin so the checkout link the
// `checkout` tool mints is openable off-device (a phone). Falls back to localhost for local dev.
const baseUrl = process.env.MCP_BASE_URL ?? `http://localhost:${PORT}`;
const { store, catalog, usingStandIn } = buildStore({ createdOrderStore, completedOrderStore, baseUrl });

// Same-origin proxy (real backend only): forward /marketplace/* to the Kotlin stack so the
// delegated page + the Multipaz verifier share ONE origin (the tunnel) — the wallet ceremony is
// origin-bound. verify_credentials.js, make_request, process_response, direct_post, get_result and
// the /delegated/* routes all resolve under /marketplace on this same origin.
const kotlinUpstream = process.env.MARKETPLACE_KOTLIN_UPSTREAM ?? "http://localhost:8100";
store.app.use(
  createProxyMiddleware({
    target: kotlinUpstream,
    changeOrigin: true,
    // /registry + /upay are proxied too so the /dev/ledger page's same-origin fetches work even
    // when Node is hit directly on :3010 (behind the container's nginx they never reach here).
    pathFilter: (path: string) =>
      path.startsWith("/marketplace") || path.startsWith("/registry") || path.startsWith("/upay"),
    on: { proxyReq: fixRequestBody },
  }),
);

// Mint an order and jump into the delegated page. The line's price/age come from the catalog at
// re-price time (invariant 2), so seeding only the id + quantity is enough.
store.app.get("/dev/buy", async (req, res) => {
  const itemId = typeof req.query.item === "string" ? req.query.item : "p16"; // Old Oak Bourbon (18+)
  const products = await catalog.load().catch((err: unknown) => {
    res.status(503).type("text").send(err instanceof Error ? err.message : String(err));
    return null;
  });
  if (!products) return;
  const p = products.find((c) => c.id === itemId) ?? products[0];
  const id = `ORD-${Math.random().toString(36).slice(2, 8)}`;
  // Seed a FULL order line (incl. minimumAge) so the checkout page's gate resolver sees the
  // age restriction — the real `checkout` tool builds this from the catalog; the store re-prices
  // regardless (invariant 2), so these values are just what the gate resolver reads.
  const line = { id: p.id, name: p.name, quantity: 1, unitPrice: p.price, lineTotal: p.price, currency: p.currency, ...(p.minimumAge != null ? { minimumAge: p.minimumAge } : {}) };
  void createdOrderStore.write(id, { id, lines: [line], subtotal: p.price, discount: 0, total: p.price, currency: p.currency, itemCount: 1 } as unknown as Order);
  // Land on the checkout hub (the two-step page) rather than jumping straight to payment.
  res.redirect(`/checkout?order=${encodeURIComponent(id)}`);
});

// Temporary ledger view (dev-only): render ONE account's real record from the System of
// Record — GET /registry/payment/account/{n}, nothing else fetched — so a settlement can be
// WATCHED landing instead of read out of the database. The account comes from ?account=<n> or
// MARKETPLACE_LEDGER_ACCOUNT; no account is baked in. Auto-refreshes every 4s, flashes new rows.
store.app.get("/dev/ledger", (req, res) => {
  const account =
    (typeof req.query.account === "string" ? req.query.account : "") ||
    process.env.MARKETPLACE_LEDGER_ACCOUNT ||
    "";
  if (!account) {
    res.status(400).type("text").send(
      "No account to show. Pass ?account=<number> or set MARKETPLACE_LEDGER_ACCOUNT.",
    );
    return;
  }
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Utopia Ledger — ${account}</title>
<style>
  :root { color-scheme: light dark; --ok:#0d9488; --bad:#dc2626; --line:rgba(128,128,128,.25); }
  body { font: 15px/1.5 system-ui, -apple-system, sans-serif; margin: 0 auto; max-width: 44rem; padding: 1.5rem 1rem 3rem; }
  h1 { font-size: 1.25rem; margin: 0; }
  .sub { opacity:.65; font-size:.85rem; margin:.15rem 0 1.25rem; }
  .live { display:inline-block; width:.55rem; height:.55rem; border-radius:50%; background:var(--ok); margin-right:.35rem; animation: pulse 2s infinite; }
  @keyframes pulse { 50% { opacity:.35; } }
  .card { border:1px solid var(--line); border-radius:.6rem; padding:1rem 1.15rem; margin-bottom:1.25rem; max-width: 16rem; }
  .card .who { font-weight:600; font-size:1rem; }
  .card .acct { opacity:.6; font-size:.82rem; }
  .card .bal { font-size:1.8rem; font-weight:700; margin-top:.35rem; font-variant-numeric: tabular-nums; }
  .pos { color:var(--ok); } .neg { color:var(--bad); }
  table { width:100%; border-collapse:collapse; font-size:.86rem; }
  th { text-align:left; opacity:.6; font-weight:600; padding:.35rem .4rem; border-bottom:1px solid var(--line); }
  td { padding:.45rem .4rem; border-bottom:1px solid var(--line); vertical-align:top; }
  td.amt { text-align:right; font-weight:600; white-space:nowrap; font-variant-numeric: tabular-nums; }
  td.id { font-family:ui-monospace,monospace; font-size:.78rem; opacity:.75; word-break:break-all; }
  tr.new td { animation: flash 2.5s ease-out; }
  @keyframes flash { 0% { background: rgba(13,148,136,.28); } 100% { background: transparent; } }
  .err { color:var(--bad); font-size:.85rem; }
</style></head>
<body>
  <h1>Utopia Ledger</h1>
  <p class="sub"><span class="live"></span>System of Record — live via <code>GET /registry/payment/account/${account}</code> · refreshes every 4s · <span id="stamp"></span></p>
  <div class="card" id="card">Loading…</div>
  <table><thead>
    <tr><th>Time (UTC)</th><th>Transaction</th><th>Counterparty</th><th>Description</th><th style="text-align:right">Amount</th><th style="text-align:right">Balance</th></tr>
  </thead><tbody id="rows"></tbody></table>
  <p class="err" id="err" hidden></p>
<script>
(function () {
  var ACCOUNT = ${JSON.stringify(account)};
  var seen = new Set(), first = true;
  var esc = function (s) { return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); };
  var money = function (n) { return "$" + Number(Math.abs(n)).toFixed(2); };
  var signed = function (n) { return (n < 0 ? "\\u2212" : "+") + money(n); };
  var fmtTime = function (t) { return esc(String(t || "").replace("T", " ").replace("Z", "")); };

  async function tick() {
    try {
      var res = await fetch("/registry/payment/account/" + encodeURIComponent(ACCOUNT));
      if (!res.ok) throw new Error("account lookup failed (" + res.status + ")");
      var d = await res.json();

      var cls = d.balance > 0 ? "pos" : (d.balance < 0 ? "neg" : "");
      document.getElementById("card").innerHTML =
        '<div class="who">' + esc(d.holder_name) + '</div>' +
        '<div class="acct">' + esc(ACCOUNT) + '</div>' +
        '<div class="bal ' + cls + '">' + (d.balance < 0 ? "\\u2212" : "") + money(d.balance) + '</div>';

      var txns = (d.transactions || []).slice().sort(function (a, b) { return String(b.time).localeCompare(String(a.time)); });
      var running = d.balance; // walk the running balance back from the CURRENT balance
      document.getElementById("rows").innerHTML = txns.map(function (t) {
        var out = !!t.to; // this account paid (money out) vs received (t.from)
        var delta = out ? -t.amount : t.amount;
        var cp = out ? t.to : t.from;
        var row = '<tr class="' + (!first && !seen.has(t.id) ? "new" : "") + '">' +
          '<td>' + fmtTime(t.time) + '</td><td class="id">' + esc(t.id) + '</td>' +
          '<td>' + (out ? "\\u2192 " : "\\u2190 ") + esc((cp && cp.name) || "?") + '</td>' +
          '<td>' + esc(t.description) + '</td>' +
          '<td class="amt ' + (out ? "neg" : "pos") + '">' + signed(delta) + '</td>' +
          '<td class="amt">' + (running < 0 ? "\\u2212" : "") + money(running) + '</td></tr>';
        running -= delta;
        return row;
      }).join("");
      txns.forEach(function (t) { seen.add(t.id); });
      first = false;

      document.getElementById("stamp").textContent = "updated " + new Date().toLocaleTimeString();
      document.getElementById("err").hidden = true;
    } catch (e) {
      var el = document.getElementById("err"); el.hidden = false;
      el.textContent = "Could not reach the System of Record: " + (e && e.message);
    }
  }
  tick(); setInterval(tick, 4000);
})();
</script>
</body></html>`);
});

await new Promise<void>((resolve) => { store.app.listen(PORT, () => resolve()); });
console.log(`
  Utopia Marketplace — delegated rail demo → http://localhost:${PORT}
  verifier: ${usingStandIn ? `LOCAL STAND-IN (presence-only-demo) · mode: ${process.env.VERDICT ?? "ok"}` : `Multipaz + UPay → ${process.env.MARKETPLACE_KOTLIN_BASE}`}

  ▶ open http://localhost:${PORT}/dev/buy            (bourbon — age, then payment)
  ▶ open http://localhost:${PORT}/dev/buy?item=p1    (apples — payment only)
`);
