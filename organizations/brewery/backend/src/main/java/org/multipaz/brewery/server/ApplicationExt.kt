package org.multipaz.brewery.server

import io.ktor.server.application.Application
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import kotlinx.coroutines.Deferred
import org.multipaz.server.common.ServerEnvironment
import org.multipaz.verifier.server.configureVerifier

/**
 * Defines server endpoints for the Brewery demo.
 *
 * Mounts all standard verifier endpoints (make_request, process_response, get_result,
 * static resources including verify_credentials.js) via [configureVerifier], then adds
 * the brewery-specific checkout endpoint.
 */
fun Application.configureRouting(environment: Deferred<ServerEnvironment>) {
    routing {
        configureVerifier(environment)
        post("/checkout") {
            breweryCheckout(call)
        }
    }
}
