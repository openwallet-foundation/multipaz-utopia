package org.multipaz.marketplace.server

import io.ktor.server.application.Application
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import kotlinx.coroutines.Deferred
import org.multipaz.server.common.ServerEnvironment
import org.multipaz.verifier.server.configureVerifier

/**
 * Defines server endpoints for the Marketplace demo.
 *
 * Mounts all standard verifier endpoints (make_request, process_response, get_result,
 * static resources including verify_credentials.js) via [configureVerifier], then adds:
 *  - `GET /catalog` — the server-authoritative catalog both storefronts render from.
 *  - `POST /checkout` — the human storefront's single-product checkout (product.html).
 *  - the `/delegated/…` routes — the external-verifier seam the MCP storefront's payment step
 *    runs on (request / result / settle).
 */
fun Application.configureRouting(environment: Deferred<ServerEnvironment>) {
    routing {
        configureVerifier(environment)
        get("/catalog") { marketplaceCatalogRoute(call) }
        get("/delegated/result") { marketplaceDelegatedResult(call) }
        post("/checkout") { marketplaceCheckout(call) }
        post("/delegated/request") { marketplaceDelegatedRequest(call) }
        post("/delegated/settle") { marketplaceDelegatedSettle(call) }
    }
}
