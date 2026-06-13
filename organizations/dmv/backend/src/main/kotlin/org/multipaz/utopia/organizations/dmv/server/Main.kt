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
