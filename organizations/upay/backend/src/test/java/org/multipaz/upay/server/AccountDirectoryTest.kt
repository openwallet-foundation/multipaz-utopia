package org.multipaz.upay.server

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests for the derivation of the payee dropdown from the registry's `identity/dump`.
 *
 * The dump is the whole population in whatever shape the registry happens to hold it, so the
 * derivation has to survive identities with no payment records, records with no account number,
 * and fields of the wrong type — without dropping the accounts that are fine.
 */
class AccountDirectoryTest {

    @Test
    fun labelsAnAccountWithItsHolderNameAndCardTitle() {
        val accounts = accountsIn("""
            [{
                "core": {"given_name": "Pivo", "family_name": "Miller"},
                "records": {"payment": {"b5E72xXH": {
                    "instance_title": "Debit Card",
                    "holder_name": "Pivo Miller",
                    "account_number": "38445565"
                }}}
            }]
        """)
        assertEquals(1, accounts.size)
        assertEquals("38445565", accounts[0].jsonObject["account_number"]!!.jsonPrimitive.content)
        assertEquals("Pivo Miller — Debit Card", accounts[0].jsonObject["label"]!!.jsonPrimitive.content)
    }

    @Test
    fun fallsBackToTheCoreNameWhenTheCardCarriesNoHolderName() {
        val accounts = accountsIn("""
            [{
                "core": {"given_name": "Pivo", "family_name": "Miller"},
                "records": {"payment": {"b5E72xXH": {
                    "instance_title": "Debit Card",
                    "account_number": "38445565"
                }}}
            }]
        """)
        assertEquals("Pivo Miller — Debit Card", accounts[0].jsonObject["label"]!!.jsonPrimitive.content)
    }

    @Test
    fun prefersTheCardsOwnHolderNameOverTheIdentityItSitsUnder() {
        // A merchant account can be held under a person's identity while naming the business.
        val accounts = accountsIn("""
            [{
                "core": {"given_name": "Pivo", "family_name": "Miller"},
                "records": {"payment": {"b5E72xXH": {
                    "instance_title": "Merchant Account",
                    "holder_name": "Utopia Supermarket",
                    "account_number": "10000001"
                }}}
            }]
        """)
        assertEquals(
            "Utopia Supermarket — Merchant Account",
            accounts[0].jsonObject["label"]!!.jsonPrimitive.content
        )
    }

    @Test
    fun listsEveryCardAnIdentityHolds() {
        val accounts = accountsIn("""
            [{
                "core": {"given_name": "Pivo", "family_name": "Miller"},
                "records": {"payment": {
                    "b5E72xXH": {"instance_title": "Debit Card", "account_number": "38445565"},
                    "c9F81yYJ": {"instance_title": "Credit Card", "account_number": "38445566"}
                }}
            }]
        """)
        assertEquals(
            listOf("38445566", "38445565"),
            accounts.map { it.jsonObject["account_number"]!!.jsonPrimitive.content }
        )
    }

    @Test
    fun ordersByLabelSoAReorderedDumpDoesNotReshuffleTheDropdown() {
        val accounts = accountsIn("""
            [
                {"core": {"given_name": "Zoe"},
                 "records": {"payment": {"z1": {"instance_title": "Debit Card", "account_number": "11111111"}}}},
                {"core": {"given_name": "Adam"},
                 "records": {"payment": {"a1": {"instance_title": "Debit Card", "account_number": "22222222"}}}}
            ]
        """)
        assertEquals(
            listOf("Adam — Debit Card", "Zoe — Debit Card"),
            accounts.map { it.jsonObject["label"]!!.jsonPrimitive.content }
        )
    }

    @Test
    fun skipsIdentitiesThatHoldNoPaymentRecords() {
        val accounts = accountsIn("""
            [{
                "core": {"given_name": "Pivo", "family_name": "Miller"},
                "records": {"mDL": {"MY-k8p40": {"instance_title": "Driver's license"}}}
            }]
        """)
        assertTrue(accounts.isEmpty())
    }

    @Test
    fun skipsCardsWithNoUsableAccountNumberButKeepsTheRest() {
        // One malformed record in the registry must not empty the dropdown.
        val accounts = accountsIn("""
            [{
                "core": {"given_name": "Pivo", "family_name": "Miller"},
                "records": {"payment": {
                    "missing": {"instance_title": "Debit Card"},
                    "blank": {"instance_title": "Debit Card", "account_number": "  "},
                    "wrongType": {"instance_title": "Debit Card", "account_number": 38445565},
                    "notEvenAnObject": "nonsense",
                    "fine": {"instance_title": "Debit Card", "account_number": "38445567"}
                }}
            }]
        """)
        assertEquals(
            listOf("38445567"),
            accounts.map { it.jsonObject["account_number"]!!.jsonPrimitive.content }
        )
    }

    @Test
    fun namesTheCardEvenWhenNothingIdentifiesItsHolder() {
        val accounts = accountsIn("""[{"records": {"payment": {"x1": {"account_number": "38445565"}}}}]""")
        assertEquals("Account", accounts[0].jsonObject["label"]!!.jsonPrimitive.content)
    }

    @Test
    fun toleratesADumpOfNothing() {
        assertTrue(accountsIn("[]").isEmpty())
    }

    private fun accountsIn(dump: String): JsonArray =
        AccountDirectory.accountsIn(Json.parseToJsonElement(dump).jsonArray)
}
