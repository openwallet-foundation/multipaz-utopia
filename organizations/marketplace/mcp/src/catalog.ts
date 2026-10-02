import type { CatalogSource, Product, Review } from "@openmobilehub/credentagent-storefront";

// Utopia Marketplace catalog for the MCP storefront — fetched, not stored.
//
// The marketplace backend owns the catalog (MarketplaceCatalog.kt + catalog.json) and serves it at
// GET /catalog; the web storefront renders from the same endpoint. This module turns that payload
// into CredentAgent Products and exposes it as a TTL-cached CatalogSource, so the gate re-prices
// every order from the backend's prices.

/** The backend's GET /catalog payload — only the fields the MCP maps. */
export interface BackendCatalog {
  currency: string;
  aisles: Array<{ id: string; name: string }>;
  products: Array<{
    id: number;
    aisle: string;
    name: string;
    price: string;
    ageRestricted: boolean;
    description: string;
    glyph: string;
    tint: number;
    reviews?: Array<{ author: string; rating: number; text: string }>;
  }>;
}

/** The backend verifier only proves 18+, so every age-restricted product maps to this threshold. */
export const AGE_RESTRICTED_MINIMUM_AGE = 18;
export const DEFAULT_CATALOG_TTL_MS = 60_000;

/**
 * `1` → `"p1"`. Deliberately NON-numeric: a bare "1" gets passed back by the model as the number 1,
 * which fails the tools' `productId: string` schema. The checkout page derives the integer back
 * from the digits.
 */
export function mcpProductId(id: number): string {
  return `p${id}`;
}

/**
 * The light-theme `--utopia-tint-1..6` values from shared/theme (utopia-theme.css), so the MCP tile
 * matches the web storefront's card.
 */
export const TINT_COLORS: Readonly<Record<number, string>> = {
  1: "#FFE1D0",
  2: "#E1EECC",
  3: "#EEE7DB",
  4: "#FFC6A5",
  5: "#CCDBB2",
  6: "#DCD3C4",
};
const NEUTRAL_TINT = 3;

const SVG_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

/**
 * The product tile as an SVG `data:` URI: the glyph centred on the tint colour, like the web
 * storefront's card. The glyph comes from the network, so it is XML-escaped before embedding.
 */
export function glyphTile(glyph: string, tint: number): string {
  const fill = TINT_COLORS[tint] ?? TINT_COLORS[NEUTRAL_TINT];
  const text = glyph.replace(/[&<>"]/g, (ch) => SVG_ESCAPES[ch]);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">` +
    `<rect width="400" height="300" fill="${fill}"/>` +
    `<text x="200" y="150" font-size="140" text-anchor="middle" dominant-baseline="central">${text}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Maps the backend payload to CredentAgent Products plus a reviews map keyed by MCP product id. */
export function mapCatalog(body: BackendCatalog): { products: Product[]; reviews: Record<string, Review[]> } {
  const aisleNames = new Map(body.aisles.map((a) => [a.id, a.name]));
  const reviews: Record<string, Review[]> = {};
  const products = body.products.map((p) => {
    const id = mcpProductId(p.id);
    if (p.reviews?.length) {
      reviews[id] = p.reviews.map((r) => ({ author: r.author, rating: r.rating, text: r.text }));
    }
    const product: Product = {
      id,
      name: p.name,
      price: Number(p.price),
      currency: body.currency,
      image: glyphTile(p.glyph, p.tint),
      category: aisleNames.get(p.aisle) ?? p.aisle,
      description: p.description,
    };
    if (p.ageRestricted) product.minimumAge = AGE_RESTRICTED_MINIMUM_AGE;
    return product;
  });
  return { products, reviews };
}

export interface HttpCatalogOptions {
  /** The backend's catalog endpoint, e.g. http://localhost:8010/catalog. */
  url: string;
  /** How long a loaded (or failed-refresh) snapshot is served before refetching. */
  ttlMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** A CatalogSource whose `reviews` object is refreshed in place on every successful load. */
export type HttpCatalog = CatalogSource & { readonly reviews: Record<string, Review[]> };

/**
 * A CredentAgent CatalogSource backed by the marketplace backend's GET /catalog.
 *
 * - Serves the cached snapshot while it is younger than `ttlMs`; concurrent loads share one request.
 * - A cold load that fails rejects (fail-closed): nothing can be priced without the backend.
 * - A refresh that fails keeps serving the last-known-good snapshot and waits one TTL before retrying.
 * - `reviews` is a stable object (the storefront holds the reference) refreshed in place.
 */
export function httpCatalog(opts: HttpCatalogOptions): HttpCatalog {
  const ttlMs = opts.ttlMs ?? DEFAULT_CATALOG_TTL_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const reviews: Record<string, Review[]> = {};
  let snapshot: Product[] | null = null;
  let freshUntil = 0;
  let inFlight: Promise<Product[]> | null = null;

  async function refresh(): Promise<Product[]> {
    try {
      const res = await fetchImpl(opts.url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`GET ${opts.url} → HTTP ${res.status}`);
      const mapped = mapCatalog((await res.json()) as BackendCatalog);
      if (mapped.products.length === 0) throw new Error(`GET ${opts.url} returned an empty catalog`);
      snapshot = mapped.products;
      for (const key of Object.keys(reviews)) delete reviews[key];
      Object.assign(reviews, mapped.reviews);
      freshUntil = now() + ttlMs;
      return snapshot;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (!snapshot) throw new Error(`Marketplace catalog unavailable: ${reason}`);
      console.warn(`[catalog] refresh from ${opts.url} failed (${reason}); serving last-known-good`);
      freshUntil = now() + ttlMs;
      return snapshot;
    }
  }

  return {
    reviews,
    load() {
      if (snapshot && now() < freshUntil) return Promise.resolve(snapshot);
      inFlight ??= refresh().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    current() {
      if (!snapshot) throw new Error("Marketplace catalog has not been loaded yet");
      return snapshot;
    },
  };
}
