package org.multipaz.records.server

import org.multipaz.documenttype.DocumentTypeRepository
import org.multipaz.documenttype.knowntypes.addKnownTypes
import org.multipaz.rpc.backend.BackendEnvironment
import org.multipaz.server.common.getBaseUrl
import org.multipaz.server.common.runServer
import org.multipaz.server.enrollment.ServerIdentity
import org.multipaz.server.enrollment.getLocalRootCertificate
import org.multipaz.storage.ephemeral.EphemeralStorage
import org.multipaz.trustmanagement.TrustManager
import org.multipaz.trustmanagement.TrustManagerInterface
import org.multipaz.trustmanagement.TrustMetadata
import org.multipaz.utopia.knowntypes.addUtopiaTypes

/**
 * Main entry point to launch the server.
 *
 * Build and start the server using
 *
 * ```./gradlew :organizations:registry:backend:run```
 *
 * Serves on port 8004 by default. The admin password needed by `/identity/load` is generated per run and
 * logged at startup; pin it with `--args="-param admin_password=<password>"`.
 */
class Main {
    companion object {
        @JvmStatic
        fun main(args: Array<String>) {
            runServer(
                args = args,
                needAdminPassword = true,
                environmentInitializer = {
                    add(DocumentTypeRepository::class,
                        DocumentTypeRepository().apply {
                            addKnownTypes()
                            addUtopiaTypes()
                        }
                    )
                    add(TrustManagerInterface::class, createTrustManager())
                }
            ) { serverEnvironment ->
                configureRouting(serverEnvironment)
            }
        }

        private suspend fun createTrustManager(): TrustManagerInterface {
            val trustManager = TrustManager(storage = EphemeralStorage())
            val certificate = getLocalRootCertificate(
                serverIdentity = ServerIdentity.CREDENTIAL_SIGNING,
                createOnRequest = true
            )
            val serverUrl = BackendEnvironment.getBaseUrl()
            trustManager.addX509Cert(
                certificate = certificate,
                metadata = TrustMetadata(
                    displayName = "Multipaz IACA root at $serverUrl",
                    privacyPolicyUrl = "https://apps.multipaz.org",
                )
            )
            return trustManager
        }
    }
}