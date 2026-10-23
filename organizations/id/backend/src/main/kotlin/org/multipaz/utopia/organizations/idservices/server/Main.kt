package org.multipaz.utopia.organizations.idservices.server

import org.multipaz.documenttype.DocumentTypeRepository
import org.multipaz.documenttype.knowntypes.addKnownTypes
import org.multipaz.openid4vci.credential.CredentialFactoryRegistry
import org.multipaz.openid4vci.server.configureRouting
import org.multipaz.server.common.runServer
import org.multipaz.utopia.issuer.IssuerAssistant
import org.multipaz.utopia.knowntypes.addUtopiaTypes

/** OpenID4VCI issuer for Utopia Personal IDs (ISO/IEC 23220-4 PhotoID). */
class Main {
    companion object {
        @JvmStatic
        fun main(args: Array<String>) {
            runServer(
                args = args,
                needAdminPassword = true,
                environmentInitializer = {
                    val registry = CredentialFactoryRegistry(listOf(CredentialFactoryPhotoId()))
                    registry.initialize()
                    add(CredentialFactoryRegistry::class, registry)

                    add(DocumentTypeRepository::class, DocumentTypeRepository().apply {
                        addKnownTypes()
                        addUtopiaTypes()
                    })
                    add(IssuerAssistant::class, IssuerAssistant.NoOp)
                },
            ) { serverEnvironment ->
                configureRouting(serverEnvironment)
            }
        }
    }
}