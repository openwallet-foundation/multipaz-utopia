package org.multipaz.utopia.organizations.dmv.server

import org.multipaz.documenttype.DocumentTypeRepository
import org.multipaz.documenttype.knowntypes.addKnownTypes
import org.multipaz.openid4vci.credential.CredentialFactoryDigitalPaymentCredential
import org.multipaz.openid4vci.credential.CredentialFactoryDigitalPaymentCredentialSdJwt
import org.multipaz.openid4vci.credential.CredentialFactoryMdl
import org.multipaz.openid4vci.credential.CredentialFactoryRegistry
import org.multipaz.openid4vci.server.configureRouting
import org.multipaz.server.common.runServer
import org.multipaz.utopia.issuer.IssuerAssistant
import org.multipaz.utopia.knowntypes.addUtopiaTypes

/**
 * Utopia DMV OID4VCI issuer.
 *
 * Run with:
 * ```
 * ./gradlew :organizations:dmv:backend:run
 * ```
 *
 * Serves on port 8002 and expects a Registry on `http://localhost:8004` by default — it reads driver records
 * from that server and enrolls its signing identity with that server's CA. Enrolling matters:
 * without it the issuer self-enrolls, and UPay and the Marketplace — which trust only the
 * Registry's IACA root — refuse the mDLs it issues. Override both URLs with
 * `--args="-param enrollment_server_url=<url> -param system_of_record_url=<url>"`.
 *
 * Issuer identity (display name, locale, logo, slug) is read from JSON config —
 * see `src/main/resources/resources/default_configuration.json`.
 */
class Main {
    companion object {
        @JvmStatic
        fun main(args: Array<String>) {
            runServer(
                args = args,
                needAdminPassword = true,
                environmentInitializer = {
                    val registry = CredentialFactoryRegistry(
                        listOf(
                            CredentialFactoryMdl(),
                        )
                    )
                    registry.initialize()
                    add(CredentialFactoryRegistry::class, registry)

                    val docTypes = DocumentTypeRepository().apply {
                        addKnownTypes()
                        addUtopiaTypes()
                    }
                    add(DocumentTypeRepository::class, docTypes)

                    add(IssuerAssistant::class, DmvIssuerAssistant())
                },
            ) { serverEnvironment ->
                configureRouting(serverEnvironment)
            }
        }
    }
}
