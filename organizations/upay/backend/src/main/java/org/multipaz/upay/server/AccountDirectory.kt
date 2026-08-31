package org.multipaz.upay.server

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.put

/**
 * The payee accounts offered in the UPay dropdown, read live from the registry.
 *
 * `identity/dump` is a blunt instrument for this — it carries every identity in full, portraits
 * included, to pick an account number and a name out of each payment record.
 *
 */
internal object AccountDirectory {
    /**
     * Lists the accounts that can be paid, as `[{account_number, label}]` ordered by label.
     *
     * @throws IllegalStateException if the registry cannot be reached or refuses the read
     */
    suspend fun list(): JsonArray = accountsIn(RegistryClient.fetchIdentityDump())

    /**
     * Derives the dropdown entries from an `identity/dump` response.
     *
     * Anything that is not a well-formed identity carrying a payment record with an account number
     * is skipped rather than failing the whole list: one malformed record in the registry should
     * not empty the dropdown.
     *
     * @param identities the registry's dump, an array of `{core, records}` objects
     * @return `[{account_number, label}]`, ordered by label so a reordered dump does not reshuffle
     *   the dropdown
     */
    internal fun accountsIn(identities: JsonArray): JsonArray {
        val accounts = identities.filterIsInstance<JsonObject>().flatMap { identity ->
            val core = identity["core"] as? JsonObject
            val fullName = listOfNotNull(core?.text("given_name"), core?.text("family_name"))
                .joinToString(" ")
            val paymentRecords = (identity["records"] as? JsonObject)?.get("payment") as? JsonObject
            paymentRecords?.values.orEmpty().mapNotNull { record ->
                val card = record as? JsonObject ?: return@mapNotNull null
                val accountNumber = card.text("account_number") ?: return@mapNotNull null
                val holderName = card.text("holder_name") ?: fullName
                val title = card.text("instance_title") ?: "Account"
                Account(
                    accountNumber = accountNumber,
                    label = listOf(holderName, title).filter { it.isNotEmpty() }.joinToString(" — ")
                )
            }
        }
        return buildJsonArray {
            for (account in accounts.sortedWith(compareBy({ it.label }, { it.accountNumber }))) {
                addJsonObject {
                    put("account_number", account.accountNumber)
                    put("label", account.label)
                }
            }
        }
    }

    /** A non-blank text field, or `null` if it is absent, not text, or blank. */
    private fun JsonObject.text(name: String): String? =
        (this[name] as? JsonPrimitive)?.takeIf { it.isString }?.content?.trim()?.takeIf { it.isNotEmpty() }

    private data class Account(val accountNumber: String, val label: String)
}
