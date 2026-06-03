package org.multipaz.brewery.server

import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.time.Clock

class CheckAgeTest {

    // --- age_over_18 (definitive) ---

    @Test
    fun ageOver18True_approves() {
        assertTrue(checkAge(buildJsonObject { put("age_over_18", true) }))
    }

    @Test
    fun ageOver18False_denies() {
        assertFalse(checkAge(buildJsonObject { put("age_over_18", false) }))
    }

    // --- age_above18 (Aadhaar; definitive) ---

    @Test
    fun ageAbove18True_approves() {
        assertTrue(checkAge(buildJsonObject { put("age_above18", true) }))
    }

    @Test
    fun ageAbove18False_denies() {
        assertFalse(checkAge(buildJsonObject { put("age_above18", false) }))
    }

    // --- age_over_21 (positive signal only) ---

    @Test
    fun ageOver21True_approves() {
        assertTrue(checkAge(buildJsonObject { put("age_over_21", true) }))
    }

    @Test
    fun ageOver21False_aloneIsInconclusive_denies() {
        // Documents the false-deny that motivated moving age_over_21 to the tail of claim_sets:
        // when only age_over_21=false is returned, the verifier can't recover. The fix lives on
        // the request side (DCQL ordering) — this test pins the response-side behaviour.
        assertFalse(checkAge(buildJsonObject { put("age_over_21", false) }))
    }

    @Test
    fun ageOver21False_fallsThroughToAgeInYears() {
        val claims = buildJsonObject {
            put("age_over_21", false)
            put("age_in_years", 20)
        }
        assertTrue(checkAge(claims))
    }

    // --- age_in_years ---

    @Test
    fun ageInYears18_approves() {
        assertTrue(checkAge(buildJsonObject { put("age_in_years", 18) }))
    }

    @Test
    fun ageInYears17_denies() {
        assertFalse(checkAge(buildJsonObject { put("age_in_years", 17) }))
    }

    // --- birth_date math ---

    @Test
    fun birthDate_30YearsAgo_approves() {
        assertTrue(checkAge(buildJsonObject { put("birth_date", yearsAgo(30)) }))
    }

    @Test
    fun birthDate_10YearsAgo_denies() {
        assertFalse(checkAge(buildJsonObject { put("birth_date", yearsAgo(10)) }))
    }

    @Test
    fun birthDate_unparseable_denies() {
        assertFalse(checkAge(buildJsonObject { put("birth_date", "not-a-date") }))
    }

    // --- empty / no-usable-claim ---

    @Test
    fun emptyClaims_denies() {
        assertFalse(checkAge(buildJsonObject {}))
    }

    @Test
    fun unrelatedClaimsOnly_denies() {
        val claims = buildJsonObject {
            put("given_name", "Jane")
            put("family_name", "Doe")
        }
        assertFalse(checkAge(claims))
    }

    // --- mirrors TestPrivacyPreservingAgeRequest ---
    // ageMdlQueryJson is a verbatim copy of ageMdlQuery() from
    // multipaz/src/commonTest/kotlin/org/multipaz/openid/dcql/TestPrivacyPreservingAgeRequest.kt.
    // The test parses it, walks every declared claim_set, builds the wallet response that
    // results from selecting that set (using the canonical "David" dataset, born 1976-03-02,
    // age 48 — the same data the canonical test provisions), and asserts checkAge approves.
    //
    // The contract being pinned: whichever claim_set the wallet picks for an 18+ holder must
    // let the brewery verifier approve. If ageMdlQuery() adds a claim_set, add the corresponding
    // value to davidClaims and the test will automatically cover it.

    @Test
    fun privacyPreservingDcql_everyClaimSet_approvesForAdult() {
        val credential = Json.parseToJsonElement(ageMdlQueryJson)
            .jsonObject["credentials"]!!.jsonArray[0].jsonObject

        // claim_id (e.g. "b") → path element name (e.g. "age_over_18")
        val claimIdToElem: Map<String, String> = credential["claims"]!!.jsonArray.associate {
            val obj = it.jsonObject
            obj["id"]!!.jsonPrimitive.content to obj["path"]!!.jsonArray[1].jsonPrimitive.content
        }

        val claimSets = credential["claim_sets"]!!.jsonArray
        assertTrue("ageMdlQuery() must declare at least one claim_set", claimSets.isNotEmpty())

        for ((index, set) in claimSets.withIndex()) {
            val ids = set.jsonArray.map { it.jsonPrimitive.content }
            val response = buildJsonObject {
                for (id in ids) {
                    val elem = claimIdToElem.getValue(id)
                    put(elem, davidClaims.getValue(elem))
                }
            }
            assertTrue(
                "checkAge must approve for claim_set #$index ($ids); payload was $response",
                checkAge(response)
            )
        }
    }

    @Test
    fun privacyPreservingDcql_noAgeInfo_denies() {
        // Mirrors mdlWithNoAgeInfo: credential has only given_name. In the real flow no claim_set
        // can be matched at the wallet (DcqlCredentialQueryException upstream) and the brewery
        // short-circuits in findIdClaims/processResponse. If such a payload ever did reach
        // checkAge, it must deny.
        val response = buildJsonObject {
            put("given_name", davidClaims.getValue("given_name"))
        }
        assertFalse(checkAge(response))
    }

    // --- helpers ---

    /** Returns an ISO date string for a person who turned [n] today (UTC), avoiding Feb 29. */
    private fun yearsAgo(n: Int): String {
        val today = Clock.System.now().toLocalDateTime(TimeZone.UTC).date
        return LocalDate(today.year - n, 1, 15).toString()
    }

    /** Verbatim copy of ageMdlQuery() in TestPrivacyPreservingAgeRequest. */
    private val ageMdlQueryJson = """
        {
          "credentials": [
            {
              "id": "my_credential",
              "format": "mso_mdoc",
              "meta": {
                "doctype_value": "org.iso.18013.5.1.mDL"
              },
              "claims": [
                {"id": "a", "path": ["org.iso.18013.5.1", "given_name"]},
                {"id": "b", "path": ["org.iso.18013.5.1", "age_over_18"]},
                {"id": "c", "path": ["org.iso.18013.5.1", "age_in_years"]},
                {"id": "d", "path": ["org.iso.18013.5.1", "birth_date"]}
              ],
              "claim_sets": [
                ["a", "b"],
                ["a", "c"],
                ["a", "d"]
              ]
            }
          ]
        }
    """.trimIndent()

    /** Canonical David dataset from TestPrivacyPreservingAgeRequest (born 1976-03-02, age 48). */
    private val davidClaims: Map<String, JsonElement> = mapOf(
        "given_name" to JsonPrimitive("David"),
        "age_over_18" to JsonPrimitive(true),
        "age_in_years" to JsonPrimitive(48),
        "birth_date" to JsonPrimitive("1976-03-02"),
    )
}
