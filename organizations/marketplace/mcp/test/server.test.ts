import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { buildStore, catalogUrlFromEnv } from "../src/server.js";
import { fixtureCatalog } from "./helpers.js";

// Bind the storefront's Express app to an ephemeral port ourselves so we get the REAL assigned
// port (the SDK's store.listen(0) returns the argument, not the OS port) and can close cleanly.
async function listenApp(app: http.RequestListener): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: (server.address() as AddressInfo).port };
}

async function withServer(fn: (port: number) => Promise<void>): Promise<void> {
  const { store } = buildStore({ catalog: fixtureCatalog() });
  const { server, port } = await listenApp(store.app as unknown as http.RequestListener);
  try {
    await fn(port);
  } finally {
    server.close();
  }
}

test("the MCP endpoint is served", async () => {
  await withServer(async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } },
      }),
    });
    assert.equal(res.status, 200);
  });
});

// Without these answering 404, the storefront's own catch-all would reply to an MCP client's auth
// probe with a page, and the client reads that as a sign-in service and fails to register.
test("MCP auth discovery is absent (404), so clients don't attempt OAuth registration", async () => {
  await withServer(async (port) => {
    for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server"]) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(res.status, 404, `${path} should not advertise an auth server`);
    }
  });
});

test("the gate's ceremony rails are mounted", async () => {
  await withServer(async (port) => {
    // An unknown order is refused by the rail itself — proving the route exists rather than
    // falling through to the storefront's catch-all.
    for (const path of ["/credentagent/delegated?order=nope", "/credentagent/credential?order=nope&cred=age"]) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(res.status, 404, `${path} should be handled by the gate`);
    }
  });
});

test("checkout is gated: an age-restricted order surfaces age and payment requirements", async () => {
  await withServer(async (port) => {
    const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    const init = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } },
      }),
    });
    assert.equal(init.status, 200);

    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        // p16 — Old Oak Bourbon, age-restricted.
        params: { name: "checkout", arguments: { items: [{ productId: "p16", quantity: 1 }] } },
      }),
    });
    assert.equal(res.status, 200);

    const payload = (await res.text())
      .split("\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => JSON.parse(l.slice(6)) as { result?: { content?: { text: string }[] } })
      .find((m) => m.result?.content?.[0]?.text);
    assert.ok(payload, "the checkout tool should return a result");

    const out = JSON.parse(payload.result!.content![0].text) as {
      orderId: string;
      checkoutUrl: string;
      requires: { credential: string; approveUrl: string }[];
    };
    assert.match(out.orderId, /^ORD-/);
    assert.ok(out.checkoutUrl.includes(`/checkout?order=${out.orderId}`));

    const byId = new Map(out.requires.map((r) => [r.credential, r.approveUrl]));
    // Age is proven on the built-in credential rail; only payment is delegated to the external
    // verifier.
    assert.match(byId.get("age") ?? "", /\/credentagent\/credential\?.*cred=age/);
    assert.match(byId.get("payment") ?? "", /\/credentagent\/delegated\?/);
    // No loyalty rail: it would accept any `org.multipaz.loyalty.1` on presence alone, and this
    // stack issues none. Every requirement surfaced here is one it can actually vouch for.
    assert.equal(byId.has("membership"), false, "checkout must not ask for a membership credential");
  });
});

test("catalog URL: MARKETPLACE_CATALOG_URL wins", () => {
  assert.equal(
    catalogUrlFromEnv({ MARKETPLACE_CATALOG_URL: "http://cat/x", MARKETPLACE_KOTLIN_BASE: "http://k" }),
    "http://cat/x",
  );
});

test("catalog URL: derived from MARKETPLACE_KOTLIN_BASE, trailing slash tolerated", () => {
  assert.equal(catalogUrlFromEnv({ MARKETPLACE_KOTLIN_BASE: "http://localhost:8100/marketplace/" }), "http://localhost:8100/marketplace/catalog");
});

test("catalog URL: defaults to the local backend", () => {
  assert.equal(catalogUrlFromEnv({}), "http://localhost:8010/catalog");
});

test("buildStore exposes the catalog it was given", () => {
  const catalog = fixtureCatalog();
  assert.equal(buildStore({ catalog }).catalog, catalog);
});
