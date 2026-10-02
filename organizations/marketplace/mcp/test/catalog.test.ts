import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart, createOrder } from "@openmobilehub/credentagent-storefront";
import { glyphTile, httpCatalog, mapCatalog } from "../src/catalog.js";
import { catalogFixture, jsonResponse } from "./helpers.js";

/** A fetch stub that replays `steps` in order (repeating the last one) and counts calls. */
function stubFetch(...steps: Array<() => Response>) {
  let calls = 0;
  const impl = (async () => {
    const step = steps[Math.min(calls, steps.length - 1)];
    calls++;
    return step();
  }) as unknown as typeof fetch;
  return { impl, calls: () => calls };
}
const serves = (body: unknown = catalogFixture) => () => jsonResponse(body);
const fails = () => () => {
  throw new TypeError("fetch failed");
};

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test("maps backend products to CredentAgent products", () => {
  const { products } = mapCatalog(catalogFixture);
  const apples = products.find((p) => p.id === "p1")!;
  assert.equal(apples.name, "Red Delicious Apples");
  assert.equal(apples.price, 4.5);
  assert.equal(apples.currency, "USD");
  assert.equal(apples.category, "Fresh Produce");
  assert.equal(apples.image, glyphTile("🍎", 2));
  assert.equal(apples.description, "Hand-picked orchard apples.");
  assert.equal("minimumAge" in apples, false);

  const bourbon = products.find((p) => p.id === "p16")!;
  assert.equal(bourbon.minimumAge, 18);
  assert.equal(bourbon.category, "Beer, Wine & Spirits");
  assert.equal(bourbon.price, 42);
});

const TILE_PREFIX = "data:image/svg+xml;charset=utf-8,";

test("glyphTile draws the glyph on the tint colour", () => {
  const tile = glyphTile("🍎", 2);
  assert.ok(tile.startsWith(TILE_PREFIX));
  const svg = decodeURIComponent(tile.slice(TILE_PREFIX.length));
  assert.ok(svg.includes("#E1EECC"));
  assert.ok(svg.includes("🍎"));
});

test("glyphTile escapes the glyph and falls back on an unknown tint", () => {
  const svg = decodeURIComponent(glyphTile('<&">', 99).slice(TILE_PREFIX.length));
  assert.ok(svg.includes("&lt;&amp;&quot;&gt;"));
  assert.ok(!svg.includes('<&"'));
  assert.ok(svg.includes("#EEE7DB"));
});

test("maps reviews under the MCP product id, omitting products without reviews", () => {
  const { reviews } = mapCatalog(catalogFixture);
  assert.equal(reviews["p1"].length, 2);
  assert.deepEqual(reviews["p16"][0], { author: "Quinn R.", rating: 5, text: "Smooth with a warm oak finish. Worth it." });
  assert.equal("p2" in reviews, false);
});

test("load() fetches once and serves the cache while fresh", async () => {
  const f = stubFetch(serves());
  const c = clock();
  const src = httpCatalog({ url: "http://x/catalog", fetchImpl: f.impl, ttlMs: 1000, now: c.now });
  await src.load();
  c.advance(999);
  const products = await src.load();
  assert.equal(f.calls(), 1);
  assert.equal(products.length, 3);
  assert.equal(src.current(), products);
});

test("load() refetches once the TTL has elapsed", async () => {
  const f = stubFetch(serves());
  const c = clock();
  const src = httpCatalog({ url: "http://x/catalog", fetchImpl: f.impl, ttlMs: 1000, now: c.now });
  await src.load();
  c.advance(1000);
  await src.load();
  assert.equal(f.calls(), 2);
});

test("concurrent loads share one request", async () => {
  const f = stubFetch(serves());
  const src = httpCatalog({ url: "http://x/catalog", fetchImpl: f.impl });
  const [a, b] = await Promise.all([src.load(), src.load()]);
  assert.equal(f.calls(), 1);
  assert.equal(a, b);
});

test("a cold load that fails rejects, and current() throws", async () => {
  const src = httpCatalog({ url: "http://x/catalog", fetchImpl: stubFetch(fails()).impl });
  await assert.rejects(src.load(), /Marketplace catalog unavailable: fetch failed/);
  assert.throws(() => src.current(), /has not been loaded yet/);
});

test("a cold load with a non-2xx status rejects", async () => {
  const src = httpCatalog({ url: "http://x/catalog", fetchImpl: stubFetch(() => jsonResponse({}, 503)).impl });
  await assert.rejects(src.load(), /HTTP 503/);
});

test("a cold load of an empty catalog rejects", async () => {
  const empty = { ...catalogFixture, products: [] };
  const src = httpCatalog({ url: "http://x/catalog", fetchImpl: stubFetch(serves(empty)).impl });
  await assert.rejects(src.load(), /empty catalog/);
});

test("a failed refresh keeps serving the last-known-good snapshot", async () => {
  const f = stubFetch(serves(), fails());
  const c = clock();
  const src = httpCatalog({ url: "http://x/catalog", fetchImpl: f.impl, ttlMs: 1000, now: c.now });
  const first = await src.load();
  c.advance(1000);
  const second = await src.load();
  assert.equal(f.calls(), 2);
  assert.equal(second, first);
  assert.equal(src.current(), first);
});

test("a failed refresh backs off for one TTL before retrying", async () => {
  const f = stubFetch(serves(), fails(), serves());
  const c = clock();
  const src = httpCatalog({ url: "http://x/catalog", fetchImpl: f.impl, ttlMs: 1000, now: c.now });
  await src.load();
  c.advance(1000);
  await src.load(); // fails → serves stale
  await src.load(); // within the back-off window → no fetch
  assert.equal(f.calls(), 2);
  c.advance(1000);
  await src.load();
  assert.equal(f.calls(), 3);
});

test("reviews are refreshed in place on the same object", async () => {
  const withoutAppleReviews = {
    ...catalogFixture,
    products: catalogFixture.products.map((p) => (p.id === 1 ? { ...p, reviews: [] } : p)),
  };
  const c = clock();
  const src = httpCatalog({
    url: "http://x/catalog",
    fetchImpl: stubFetch(serves(), serves(withoutAppleReviews)).impl,
    ttlMs: 1000,
    now: c.now,
  });
  const reviews = src.reviews;
  await src.load();
  assert.equal(reviews["p1"].length, 2);
  c.advance(1000);
  await src.load();
  assert.equal(src.reviews, reviews);
  assert.equal("p1" in reviews, false);
  assert.equal(reviews["p16"].length, 1);
});

test("grocery-only cart priced from the mapped catalog is not age-restricted", () => {
  const { products } = mapCatalog(catalogFixture);
  const cart = priceCart([{ productId: "p1", quantity: 2 }], products); // 4.50 × 2
  assert.equal(cart.hasAgeRestricted, false);
  assert.equal(cart.total, 9);
});

test("an alcohol item makes the cart age-restricted (18+)", () => {
  const { products } = mapCatalog(catalogFixture);
  const cart = priceCart([{ productId: "p16", quantity: 1 }], products);
  assert.equal(cart.hasAgeRestricted, true);
  assert.equal(cart.lines[0].minimumAge, 18);
});

test("createOrder snapshots the priced total", () => {
  const { products } = mapCatalog(catalogFixture);
  const order = createOrder(
    [
      { productId: "p1", quantity: 1 }, // 4.50
      { productId: "p2", quantity: 2 }, // 2.20 × 2
    ],
    "ORD-1",
    products,
  );
  assert.equal(order.total, 8.9);
  assert.equal(order.currency, "USD");
});
