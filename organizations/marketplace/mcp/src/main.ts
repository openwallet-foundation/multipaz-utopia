import { buildStore, catalogUrlFromEnv } from "./server.js";
import { FileOrderStore, completedOrdersFile, createdOrdersFile } from "./orderStore.js";

// Both order stores are persisted, so a restart/redeploy neither invalidates an outstanding
// checkout link nor forgets a purchase that already settled.
const { store, usingStandIn } = buildStore({
  createdOrderStore: new FileOrderStore(createdOrdersFile()),
  completedOrderStore: new FileOrderStore(completedOrdersFile()),
});
const port = Number(process.env.MCP_PORT ?? 3005);
const { url } = await store.listen(port);

console.log(`Utopia Marketplace MCP storefront → ${url}`);
console.log(`Checkout runs INSIDE the mounted CredentAgent delegated ceremony (/credentagent/delegated).`);
console.log(`Catalog: ${catalogUrlFromEnv()} (fetched on first use, cached)`);
if (usingStandIn) {
  console.log(
    `Verifier: LOCAL STAND-IN (dev-only, presence-only-demo) · mode: ${process.env.VERDICT ?? "ok"}. ` +
      `Set MARKETPLACE_KOTLIN_BASE to use the real Multipaz + UPay backend.`,
  );
} else {
  console.log(`Verifier: Multipaz + UPay adapter → ${process.env.MARKETPLACE_KOTLIN_BASE}`);
}
