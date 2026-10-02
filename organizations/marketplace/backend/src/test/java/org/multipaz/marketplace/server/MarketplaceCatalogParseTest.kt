package org.multipaz.marketplace.server

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pins [MarketplaceCatalog.parse]'s validation. The catalog is server-authoritative at checkout, so a
 * malformed entry must stop the server at startup rather than surface as a wrong price or a skipped
 * age check later.
 */
class MarketplaceCatalogParseTest {

    private fun product(
        id: Int = 1,
        aisle: String = "produce",
        price: String = "4.50",
        tint: Int = 2,
        rating: Int = 5,
    ) = """
        {
          "id": $id, "aisle": "$aisle", "name": "Item $id", "price": "$price",
          "ageRestricted": false, "unit": "1 kg", "tagline": "T", "description": "D",
          "highlights": ["H"], "specs": { "B": "2", "A": "1" }, "note": "N",
          "glyph": "🍎", "tint": $tint,
          "reviews": [ { "author": "A", "rating": $rating, "text": "ok" } ]
        }
    """.trimIndent()

    private fun catalog(vararg products: String) = """
        {
          "currency": "USD",
          "aisles": [ { "id": "produce", "name": "Fresh Produce", "blurb": "Fresh." } ],
          "products": [ ${products.joinToString(",")} ]
        }
    """.trimIndent()

    private fun assertRejected(json: String, messagePart: String) {
        val err = assertThrows(IllegalArgumentException::class.java) { MarketplaceCatalog.parse(json) }
        assertTrue("expected '$messagePart' in: ${err.message}", err.message!!.contains(messagePart))
    }

    @Test
    fun nonUsdCurrency_isRejected() {
        assertRejected(catalog(product()).replace("\"USD\"", "\"EUR\""), "currency")
    }

    @Test
    fun duplicateAisleId_isRejected() {
        val dup = """{ "id": "produce", "name": "Again", "blurb": "Dup." }"""
        assertRejected(
            catalog(product()).replace("\"aisles\": [", "\"aisles\": [ $dup,"),
            "Duplicate aisle id produce",
        )
    }

    @Test
    fun validCatalog_parses() {
        val parsed = MarketplaceCatalog.parse(catalog(product(id = 1), product(id = 2)))
        assertEquals(2, parsed.products.size)
        assertEquals("4.50", parsed.products[0].price)
        assertEquals("Fresh Produce", parsed.aisles[0].name)
    }

    @Test
    fun specs_keepTheirOrder_throughParseAndEncode() {
        val parsed = MarketplaceCatalog.parse(catalog(product()))
        assertEquals(listOf("B", "A"), parsed.products[0].specs.keys.toList())
        val reparsed = MarketplaceCatalog.parse(MarketplaceCatalog.encode(parsed))
        assertEquals(listOf("B", "A"), reparsed.products[0].specs.keys.toList())
    }

    @Test
    fun encode_includesDefaultedFields() {
        val noReviews = product().replace(Regex(""",\s*"reviews": \[[^\]]*\]"""), "")
        val encoded = MarketplaceCatalog.encode(MarketplaceCatalog.parse(catalog(noReviews)))
        assertTrue(encoded, encoded.contains("\"reviews\":[]"))
    }

    @Test
    fun duplicateId_isRejected() = assertRejected(catalog(product(id = 1), product(id = 1)), "Duplicate product id 1")

    @Test
    fun unknownAisle_isRejected() = assertRejected(catalog(product(aisle = "nowhere")), "unknown aisle 'nowhere'")

    @Test
    fun negativePrice_isRejected() = assertRejected(catalog(product(price = "-1.00")), "invalid price '-1.00'")

    @Test
    fun zeroPrice_isRejected() = assertRejected(catalog(product(price = "0.00")), "invalid price '0.00'")

    @Test
    fun malformedPrice_isRejected() = assertRejected(catalog(product(price = "4.5.0")), "invalid price '4.5.0'")

    @Test
    fun threeDecimalPrice_isRejected() = assertRejected(catalog(product(price = "4.505")), "invalid price '4.505'")

    @Test
    fun tintBelowRange_isRejected() = assertRejected(catalog(product(tint = 0)), "tint 0")

    @Test
    fun tintAboveRange_isRejected() = assertRejected(catalog(product(tint = 7)), "tint 7")

    @Test
    fun ratingBelowRange_isRejected() = assertRejected(catalog(product(rating = 0)), "rating 0")

    @Test
    fun ratingAboveRange_isRejected() = assertRejected(catalog(product(rating = 6)), "rating 6")

    @Test
    fun emptyCatalog_isRejected() = assertRejected(catalog(), "no products")

    @Test
    fun malformedJson_isRejected() {
        assertThrows(IllegalArgumentException::class.java) { MarketplaceCatalog.parse("{ not json") }
    }
}
