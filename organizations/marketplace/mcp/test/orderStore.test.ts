import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOrder } from "@openmobilehub/credentagent-storefront";
import { FileOrderStore } from "../src/orderStore.js";
import { mapCatalog } from "../src/catalog.js";
import { catalogFixture } from "./helpers.js";

// Orders are priced against the backend-shaped fixture (p1 4.50, p2 2.20, p16 42.00).
const catalog = mapCatalog(catalogFixture).products;

function tempFile(): string {
  return join(mkdtempSync(join(tmpdir(), "mcp-orders-")), "orders.json");
}

test("read returns null for an unknown id", async () => {
  const file = tempFile();
  try {
    assert.equal(await new FileOrderStore(file).read("missing"), null);
  } finally {
    rmSync(file, { force: true });
  }
});

test("write then read round-trips the order; clear removes it", async () => {
  const file = tempFile();
  try {
    const store = new FileOrderStore(file);
    const order = createOrder([{ productId: "p2", quantity: 1 }], "ORD-9", catalog); // Organic Bananas 2.20
    await store.write("ORD-9", order);
    assert.equal((await store.read("ORD-9"))?.total, 2.2);
    await store.clear("ORD-9");
    assert.equal(await store.read("ORD-9"), null);
  } finally {
    rmSync(file, { force: true });
  }
});

// The reason this store is file-backed at all: a checkout link is minted, and the buyer opens it
// minutes later on a phone — possibly after a restart in between. An order lost there makes a
// perfectly valid link answer "Unknown order".
test("orders survive a restart (a second store over the same file sees them)", async () => {
  const file = tempFile();
  try {
    const order = createOrder([{ productId: "p16", quantity: 1 }], "ORD-restart", catalog); // 42.00
    await new FileOrderStore(file).write("ORD-restart", order);

    const reopened = new FileOrderStore(file);
    assert.equal((await reopened.read("ORD-restart"))?.total, 42);
  } finally {
    rmSync(file, { force: true });
  }
});

test("clear is persisted too, so a cleared order stays gone after a restart", async () => {
  const file = tempFile();
  try {
    const store = new FileOrderStore(file);
    await store.write("ORD-x", createOrder([{ productId: "p1", quantity: 1 }], "ORD-x", catalog));
    await store.clear("ORD-x");

    assert.equal(await new FileOrderStore(file).read("ORD-x"), null);
  } finally {
    rmSync(file, { force: true });
  }
});
