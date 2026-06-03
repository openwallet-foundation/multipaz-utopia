package org.multipaz.brewery.server

import org.multipaz.documenttype.DocumentTypeRepository
import org.multipaz.server.common.runServer
import org.multipaz.trustmanagement.TrustManagerInterface
import org.multipaz.verifier.customization.VerifierAssistant
import org.multipaz.verifier.request.documentTypeRepo
import org.multipaz.verifier.request.getIssuerTrustManager

/**
 * Main entry point for the Brewery demo server.
 *
 * Build and start the server using:
 *
 * ```./gradlew multipaz-utopia:organizations:brewery:backend:run```
 */
class Main {
    companion object {
        @JvmStatic
        fun main(args: Array<String>) {
            runServer(args, environmentInitializer = {
                add(DocumentTypeRepository::class, documentTypeRepo)
                add(TrustManagerInterface::class, getIssuerTrustManager())
                add(VerifierAssistant::class, BreweryVerifierAssistant())
            }) { environment ->
                configureRouting(environment)
            }
        }
    }
}
