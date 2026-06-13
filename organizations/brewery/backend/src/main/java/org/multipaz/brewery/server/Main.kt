package org.multipaz.brewery.server

import kotlinx.coroutines.CancellationException
import org.multipaz.documenttype.DocumentTypeRepository
import org.multipaz.documenttype.knowntypes.addKnownTypes
import org.multipaz.rpc.backend.BackendEnvironment
import org.multipaz.rpc.backend.Configuration
import org.multipaz.server.common.enrollmentServerUrl
import org.multipaz.server.common.runServer
import org.multipaz.server.enrollment.ServerIdentity
import org.multipaz.server.enrollment.getIdentityRootCertificate
import org.multipaz.storage.ephemeral.EphemeralStorage
import org.multipaz.trustmanagement.TrustManager
import org.multipaz.trustmanagement.TrustManagerInterface
import org.multipaz.trustmanagement.TrustMetadata
import org.multipaz.util.Logger
import org.multipaz.utopia.knowntypes.addUtopiaTypes
import org.multipaz.verifier.customization.VerifierAssistant

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
                add(DocumentTypeRepository::class,
                    DocumentTypeRepository().apply {
                        addKnownTypes()
                        addUtopiaTypes()
                    }
                )
                add(TrustManagerInterface::class, getIssuerTrustManager())
                add(VerifierAssistant::class, BreweryVerifierAssistant())
            }) { environment ->
                configureRouting(environment)
            }
        }

        suspend fun getIssuerTrustManager(): TrustManagerInterface {
            val trustManager = TrustManager(EphemeralStorage())
            // Only trust our System of Records; other servers will not have correct
            // account numbers anyway
            val caUrl = BackendEnvironment.getInterface(Configuration::class)!!.enrollmentServerUrl
            if (caUrl != null) {
                addMultipazCAServer(trustManager, caUrl)
            }
            return trustManager
        }

        suspend fun addMultipazCAServer(trustManager: TrustManager, serverUrl: String) {
            try {
                Logger.i(TAG, "Adding IACA root from $serverUrl...")
                val certificate = getIdentityRootCertificate(
                    serverIdentity = ServerIdentity.CREDENTIAL_SIGNING,
                    serverUrl = serverUrl
                )
                trustManager.addX509Cert(
                    certificate = certificate,
                    metadata = TrustMetadata(
                        displayName = "Multipaz IACA root at $serverUrl",
                        privacyPolicyUrl = "https://apps.multipaz.org",
                    )
                )
                Logger.i(TAG, "IACA root from $serverUrl added")
            } catch(err: CancellationException) {
                throw err
            } catch(err: Exception) {
                Logger.e(TAG, "Error loading IACA certificate from $serverUrl", err)
            }
        }

        const val TAG = "Main"
    }
}
