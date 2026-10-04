import { createStorefront } from "@openmobilehub/credentagent-storefront/server";
import type { CompletedOrderRecord, OrderStore } from "@openmobilehub/credentagent-storefront/server";
import type { Order } from "@openmobilehub/credentagent-storefront";
import { CredentAgent, required, age, payment } from "@openmobilehub/credentagent-gate";
import { DEFAULT_CATALOG_TTL_MS, httpCatalog, type HttpCatalog } from "./catalog.js";
import { multipazUpayVerifier, standInVerifier, type StandInMode } from "./verifier.js";

export interface BuildStoreOptions {
  baseUrl?: string;
  /** Created-but-unpaid orders. Default: in-memory, which loses them on restart. */
  createdOrderStore?: OrderStore<Order>;
  /** Completed purchases, behind `get-order-status`. Default: in-memory. */
  completedOrderStore?: OrderStore<CompletedOrderRecord>;
  /** Catalog source. Default: the marketplace backend's GET /catalog (see catalogUrlFromEnv). */
  catalog?: HttpCatalog;
}

/**
 * Where the backend serves the catalog: MARKETPLACE_CATALOG_URL, else MARKETPLACE_KOTLIN_BASE +
 * "/catalog", else the local backend on :8010.
 */
export function catalogUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  if (env.MARKETPLACE_CATALOG_URL) return env.MARKETPLACE_CATALOG_URL;
  const base = (env.MARKETPLACE_KOTLIN_BASE ?? "http://localhost:8010").replace(/\/+$/, "");
  return `${base}/catalog`;
}

/**
 * The MCP storefront with CredentAgent's delegated ceremony mounted (S6, issue #16): the real
 * Multipaz + UPay payment runs inside the mounted rail through a host-side DelegatedVerifier.
 * The gate policy is the same one the presence-only path uses — only the backend moved.
 */
export function buildStore(opts: BuildStoreOptions = {}) {
  const baseUrl = opts.baseUrl;
  // Note: the delegated age re-check takes its threshold from the order's catalog `minimumAge`,
  // so raising this alone does not raise the age actually enforced.
  const minAge = Number(process.env.MARKETPLACE_AGE ?? 18);
  const hasAlcohol = (o: { lines?: Array<{ minimumAge?: number }> }): boolean =>
    (o.lines ?? []).some((l) => (l.minimumAge ?? 0) >= 18);
  const ageCred = age.over(minAge).when(hasAlcohol);
  const payCred = payment.in("usd");
  // No loyalty rail here on purpose. `membership.discount()` asks for `org.multipaz.loyalty.1` and
  // accepts it on presence alone — no issuer trust anchor — while Utopia issues no loyalty
  // credential at all. Wiring it would mean any loyalty card, from any issuer, discounts a payment
  // that really settles. Every requirement below is one this stack can actually vouch for.

  // Real Multipaz + UPay when a backend is configured; otherwise a stand-in so the rail stays
  // clickable offline. VERDICT (wrong-amount | underage | declined) drives its refusal modes.
  const kotlinBase = process.env.MARKETPLACE_KOTLIN_BASE;
  const verifier = kotlinBase
    ? multipazUpayVerifier({ kotlinBase, verifierBase: process.env.MARKETPLACE_VERIFIER_BASE ?? kotlinBase })
    : standInVerifier((process.env.VERDICT as StandInMode) ?? "ok");

  // The backend owns the catalog; it is fetched on first use and TTL-cached, so the MCP can start
  // before the backend and every order is re-priced from the backend's prices.
  // A non-numeric or negative TTL falls back to the default rather than silently disabling the cache.
  const ttl = Number(process.env.MARKETPLACE_CATALOG_TTL_MS);
  const catalog =
    opts.catalog ??
    httpCatalog({
      url: catalogUrlFromEnv(),
      ttlMs: process.env.MARKETPLACE_CATALOG_TTL_MS && Number.isFinite(ttl) && ttl >= 0 ? ttl : DEFAULT_CATALOG_TTL_MS,
    });

  const store = createStorefront({
    catalog,
    reviews: catalog.reviews,
    ...(baseUrl ?? process.env.MCP_BASE_URL ? { baseUrl: baseUrl ?? process.env.MCP_BASE_URL } : {}),
    ...(opts.createdOrderStore ? { createdOrderStore: opts.createdOrderStore } : {}),
    ...(opts.completedOrderStore ? { orderStore: opts.completedOrderStore } : {}),
    allowEphemeralKey: true,
    // Stateless transport is required for connector/serverless requests without a session header.
    // Storefront 0.5 carries a signed cart id between calls, so each browser conversation keeps
    // its own cart rather than sharing the global fallback used by the 0.4 demo.
    statelessMcp: true,
    verifier,
  });

  const credentagent = new CredentAgent({ credentials: [ageCred, payCred] });
  credentagent.mount(store.app);
  store.gate((order) => credentagent.requirements(order, [required(ageCred), required(payCred)]));

  return { store, catalog, usingStandIn: !kotlinBase };
}
