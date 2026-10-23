package org.multipaz.utopia.organizations.idservices.server

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.TimeZone
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.yearsUntil
import org.multipaz.cbor.Bstr
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.DataItem
import org.multipaz.cbor.RawCbor
import org.multipaz.cbor.Simple
import org.multipaz.cbor.Tagged
import org.multipaz.cbor.Tstr
import org.multipaz.cbor.Uint
import org.multipaz.cbor.buildCborMap
import org.multipaz.cbor.toDataItem
import org.multipaz.cbor.toDataItemFullDate
import org.multipaz.cose.Cose
import org.multipaz.cose.CoseLabel
import org.multipaz.cose.CoseNumberLabel
import org.multipaz.crypto.Algorithm
import org.multipaz.crypto.EcPublicKey
import org.multipaz.documenttype.knowntypes.PhotoID
import org.multipaz.mdoc.issuersigned.buildIssuerNamespaces
import org.multipaz.mdoc.mso.MobileSecurityObject
import org.multipaz.openid4vci.credential.CredentialDisplay
import org.multipaz.openid4vci.credential.CredentialFactory
import org.multipaz.openid4vci.credential.MintedCredential
import org.multipaz.openid4vci.util.CredentialId
import org.multipaz.openid4vci.util.CredentialState
import org.multipaz.provisioning.CredentialFormat
import org.multipaz.revocation.RevocationStatus
import org.multipaz.rpc.backend.BackendEnvironment
import org.multipaz.rpc.backend.Resources
import org.multipaz.server.common.getBaseUrl
import org.multipaz.util.toBase64Url
import org.multipaz.util.truncateToWholeSeconds
import kotlin.time.Clock
import kotlin.time.Duration.Companion.days

/** Issues ISO/IEC 23220-4 PhotoIDs from a resident's Registry core record. */
class CredentialFactoryPhotoId : CredentialFactory {
    override val configurationId = "photoid"
    override val scope = "core"
    override val format = CredentialFormat.Mdoc(PhotoID.PHOTO_ID_DOCTYPE)
    override val proofSigningAlgorithms = CredentialFactory.DEFAULT_PROOF_SIGNING_ALGORITHMS
    override val cryptographicBindingMethods = listOf("cose_key")
    override val name = "Utopia Personal ID"
    override val logo = "card-pid.jpg"

    override suspend fun mint(
        systemOfRecordData: DataItem,
        authenticationKey: EcPublicKey?,
        credentialId: CredentialId,
    ): MintedCredential {
        requireNotNull(authenticationKey) { "PhotoID issuance requires a wallet authentication key" }

        val now = Clock.System.now().truncateToWholeSeconds()
        val core = systemOfRecordData["core"]
        val birthDate = core["birth_date"].asDateString
        val timeZone = TimeZone.currentSystemDefault()
        val issueDate = now.toLocalDateTime(timeZone).date
        val expiryDate = issueDate.plus(5, DateTimeUnit.YEAR)
        val age = birthDate.yearsUntil(issueDate)
        val fallbackPortrait = Bstr(BackendEnvironment.getInterface(Resources::class)!!
            .getRawResource("female.jpg")!!.toByteArray())

        val issuerNamespaces = buildIssuerNamespaces {
            addNamespace(PhotoID.ISO_23220_2_NAMESPACE) {
                // The six ISO mandatory PhotoID data elements.
                addDataElement("family_name", core["family_name"])
                addDataElement("given_name", core["given_name"])
                addDataElement("birth_date", birthDate.toDataItemFullDate())
                val portrait = if (core.hasKey("portrait")) {
                    core["portrait"]
                } else {
                    // Seed records may be issued before an operator uploads a fictional portrait.
                    fallbackPortrait
                }
                addDataElement("portrait", portrait)
                addDataElement("issue_date", issueDate.toDataItemFullDate())
                addDataElement("expiry_date", expiryDate.toDataItemFullDate())
                addDataElement("issuing_authority", Tstr("Utopia ID Services"))
                // Utopia is a fictional US state; the ISO field requires an alpha-2 code.
                addDataElement("issuing_country", Tstr("US"))

                // Standard, selective-disclosure age assertions used by verifiers such as Transit.
                addDataElement("age_in_years", Uint(age.toULong()))
                addDataElement("age_birth_year", Uint(birthDate.year.toULong()))
                addDataElement("age_over_18", if (age >= 18) Simple.TRUE else Simple.FALSE)
                addDataElement("age_over_65", if (age >= 65) Simple.TRUE else Simple.FALSE)

                if (core.hasKey("utopia_id_number")) {
                    addDataElement("document_number", core["utopia_id_number"])
                }
                if (core.hasKey("sex")) addDataElement("sex", core["sex"])
                if (core.hasKey("portrait_capture_date")) {
                    addDataElement("portrait_capture_date", core["portrait_capture_date"])
                }
                if (core.hasKey("address")) {
                    val address = core["address"]
                    if (address.hasKey("formatted")) addDataElement("resident_address", address["formatted"])
                    if (address.hasKey("country")) addDataElement("resident_country", address["country"])
                    if (address.hasKey("region")) addDataElement("resident_state", address["region"])
                    if (address.hasKey("locality")) addDataElement("resident_city", address["locality"])
                    if (address.hasKey("postal_code")) addDataElement("resident_postal_code", address["postal_code"])
                    if (address.hasKey("street")) addDataElement("resident_street", address["street"])
                    if (address.hasKey("house_number")) addDataElement("resident_house_number", address["house_number"])
                }
            }
            if (core.hasKey("utopia_id_number")) {
                addNamespace(PhotoID.PHOTO_ID_NAMESPACE) {
                    addDataElement("person_id", core["utopia_id_number"])
                    addDataElement("administrative_number", core["utopia_id_number"])
                }
            }
        }

        val baseUrl = BackendEnvironment.getBaseUrl()
        val revocationStatus = RevocationStatus.IdentifierList(
            id = CredentialState.indexToIdentifier(credentialId.index),
            uri = "$baseUrl/identifier_list/${credentialId.bucket}",
            certificate = null,
        )
        val mso = MobileSecurityObject(
            version = "1.0",
            docType = PhotoID.PHOTO_ID_DOCTYPE,
            signedAt = now,
            validFrom = now,
            validUntil = now + 30.days,
            expectedUpdate = null,
            digestAlgorithm = Algorithm.SHA256,
            valueDigests = issuerNamespaces.getValueDigests(Algorithm.SHA256),
            deviceKey = authenticationKey,
            revocationStatus = revocationStatus,
            deviceKeyAuthorizedNamespaces = emptyList(),
            deviceKeyAuthorizedDataElements = emptyMap(),
        )
        val taggedEncodedMso = Cbor.encode(Tagged(Tagged.ENCODED_CBOR, Bstr(Cbor.encode(mso.toDataItem()))))
        val signingKey = getSigningKey()
        val encodedIssuerAuth = Cbor.encode(
            Cose.coseSign1Sign(
                signingKey,
                taggedEncodedMso,
                true,
                mapOf<CoseLabel, DataItem>(CoseNumberLabel(Cose.COSE_LABEL_ALG) to Algorithm.ES256.coseAlgorithmIdentifier!!.toDataItem()),
                mapOf<CoseLabel, DataItem>(CoseNumberLabel(Cose.COSE_LABEL_X5CHAIN) to signingKey.certChain.toCoseX5Chain()),
            ).toDataItem(),
        )
        val credential = Cbor.encode(buildCborMap {
            put("nameSpaces", issuerNamespaces.toDataItem())
            put("issuerAuth", RawCbor(encodedIssuerAuth))
        }).toBase64Url()
        return MintedCredential(credential = credential, creation = now, expiration = now + 30.days)
    }

    override suspend fun display(systemOfRecordData: DataItem): CredentialDisplay =
        CredentialDisplay.create(systemOfRecordData, "credential_pid")
}
