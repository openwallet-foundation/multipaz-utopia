import { readFileSync } from "node:fs";
import { httpCatalog, type BackendCatalog, type HttpCatalog } from "../src/catalog.js";

/** A 3-product catalog in the backend's GET /catalog shape (p1 apples, p2 bananas, p16 bourbon 18+). */
export const catalogFixture = JSON.parse(
  readFileSync(new URL("./fixtures/catalog.json", import.meta.url), "utf8"),
) as BackendCatalog;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** An httpCatalog that always serves the fixture — for tests that need a working catalog, no backend. */
export function fixtureCatalog(): HttpCatalog {
  return httpCatalog({
    url: "http://catalog.test/catalog",
    fetchImpl: (async () => jsonResponse(catalogFixture)) as unknown as typeof fetch,
  });
}
