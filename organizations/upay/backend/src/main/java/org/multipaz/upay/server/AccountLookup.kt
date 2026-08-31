package org.multipaz.upay.server

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.multipaz.cbor.Tstr
import org.multipaz.claim.MdocClaim
import org.multipaz.rpc.backend.BackendEnvironment
import org.multipaz.rpc.handler.InvalidRequestException
import org.multipaz.trustmanagement.TrustManagerInterface
import org.multipaz.verification.MdocVerifiedPresentation
import org.multipaz.verifier.customization.VerifierAssistant
import org.multipaz.verifier.customization.VerifierPresentment

/**
 * Read-only account lookup: shows a holder their own balance and transactions.
 *
 * The account number comes only from the issuer-signed `payment_instrument_id` claim of a
 * presented Digital Payment Credential, never from the browser, so there is nothing to enumerate.
 * The query carries no `transaction_data`, so this flow debits nothing.
 */
internal object AccountLookup: VerifierAssistant {
    /**
     * Builds the DCQL query that asks the wallet for the holder's payment card.
     *
     * @param request the JSON request as sent by the front-end; only `protocols` is carried over
     * @return the verifier request to send to the wallet
     */
    override suspend fun processRequest(request: JsonObject): JsonObject {
        return buildJsonObject {
            putJsonObject("dcql") {
                putJsonArray("credentials") {
                    addJsonObject {
                        put("id", UPayVerifierAssistant.CREDENTIAL_ID_ACCOUNT)
                        put("format", "mso_mdoc")
                        putJsonObject("meta") {
                            put("doctype_value", PAYMENT_DOCTYPE)
                        }
                        putJsonArray("claims") {
                            for (claimName in REQUESTED_CLAIMS) {
                                addJsonObject {
                                    putJsonArray("path") {
                                        add(PAYMENT_NS)
                                        add(claimName)
                                    }
                                    put("intent_to_retain", false)
                                }
                            }
                        }
                    }
                }
            }
            request["protocols"]?.let { put("protocols", it) }
        }
    }

    /**
     * Verifies the presented card and returns the statement for the account it names.
     *
     * @param presentment the request to the wallet and its verified response
     * @return `{account_number, holder_name, balance, transactions}`, with the account number and
     *   holder name taken from the signed claims rather than from the registry
     * @throws InvalidRequestException if no payment card was presented, if its issuer is not
     *   trusted, or if it carries no usable account number
     * @throws IllegalStateException if the registry cannot be reached or refuses the read
     */
    override suspend fun processResponse(presentment: VerifierPresentment): JsonObject {
        val card = presentment.presentations.filterIsInstance<MdocVerifiedPresentation>()
            .find { it.docType == PAYMENT_DOCTYPE }
            ?: throw InvalidRequestException("Payment card was not presented")
        val certChain = card.documentSignerCertChain
            ?: throw InvalidRequestException("Payment card carries no document signer certificate")
        val trustManager = BackendEnvironment.getInterface(TrustManagerInterface::class)!!
        if (!trustManager.verify(certChain.certificates).isTrusted) {
            throw InvalidRequestException("Payment card is not from a trusted issuer")
        }
        val accountNumber = card.signedStringClaim(CLAIM_PAYMENT_INSTRUMENT_ID)
            ?: throw InvalidRequestException("Payment card carries no account number")
        val statement = RegistryClient.fetchStatement(accountNumber)
        return buildJsonObject {
            put("account_number", accountNumber)
            put("holder_name", card.signedStringClaim(CLAIM_HOLDER_NAME) ?: "")
            statement["balance"]?.let { put("balance", it) }
            put("transactions", statement["transactions"] ?: buildJsonObject { })
        }
    }

    /**
     * Reads a text claim signed by the issuer, or `null` if absent or not text. Only issuer-signed
     * claims are consulted: device-signed ones are self-asserted and could name someone else's
     * account.
     */
    private fun MdocVerifiedPresentation.signedStringClaim(dataElementName: String): String? {
        val claim = issuerSignedClaims.filterIsInstance<MdocClaim>().find {
            it.namespaceName == PAYMENT_NS && it.dataElementName == dataElementName
        }
        return (claim?.value as? Tstr)?.asTstr
    }

    private const val CLAIM_PAYMENT_INSTRUMENT_ID = "payment_instrument_id"
    private const val CLAIM_HOLDER_NAME = "holder_name"

    private val REQUESTED_CLAIMS = listOf(CLAIM_PAYMENT_INSTRUMENT_ID, CLAIM_HOLDER_NAME)

    private const val PAYMENT_DOCTYPE = TransactionProcessor.PAYMENT_DOCTYPE
    private const val PAYMENT_NS = TransactionProcessor.PAYMENT_NS
}
