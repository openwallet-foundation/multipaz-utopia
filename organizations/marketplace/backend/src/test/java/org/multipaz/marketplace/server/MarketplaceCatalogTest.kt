package org.multipaz.marketplace.server

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pins the server-authoritative catalog loaded from `resources/catalog.json`. Checkout derives the
 * price and the age-restricted flag from these values (by productId), so they must not silently
 * drift or a crafted request could buy alcohol without an age check or a real item at the wrong amount.
 */
class MarketplaceCatalogTest {

    private val expected = mapOf(
        1 to ("Red Delicious Apples" to "4.50"),
        2 to ("Organic Bananas" to "2.20"),
        3 to ("Vine Tomatoes" to "3.80"),
        4 to ("Artisan Sourdough" to "5.00"),
        5 to ("Butter Croissants" to "4.20"),
        6 to ("Whole Milk" to "1.80"),
        7 to ("Free-Range Eggs" to "3.60"),
        8 to ("Aged Cheddar" to "6.40"),
        9 to ("Spaghetti No. 5" to "1.60"),
        10 to ("Extra Virgin Olive Oil" to "9.50"),
        11 to ("Honey Oat Cereal" to "4.00"),
        12 to ("Fresh Orange Juice" to "3.90"),
        13 to ("Ground Coffee" to "8.20"),
        14 to ("Craft Lager" to "11.00"),
        15 to ("Reserve Red Wine" to "18.00"),
        16 to ("Old Oak Bourbon" to "42.00"),
    )

    @Test
    fun resource_holdsExactlyTheSixteenProducts_withUnchangedNamesAndPrices() {
        assertEquals(expected.keys, marketplaceCatalog.products.map { it.id }.toSet())
        for ((id, nameAndPrice) in expected) {
            val p = findCatalogProduct(id)!!
            assertEquals("name of $id", nameAndPrice.first, p.name)
            assertEquals("price of $id", nameAndPrice.second, p.price)
        }
    }

    @Test
    fun resource_holdsTheSixAislesInDisplayOrder() {
        assertEquals(
            listOf("produce", "bakery", "dairy", "pantry", "beverages", "spirits"),
            marketplaceCatalog.aisles.map { it.id },
        )
        assertEquals("USD", marketplaceCatalog.currency)
    }

    @Test
    fun everyProduct_carriesDisplayContent() {
        for (p in marketplaceCatalog.products) {
            assertTrue("description of ${p.id}", p.description.isNotBlank())
            assertTrue("glyph of ${p.id}", p.glyph.isNotBlank())
            assertTrue("specs of ${p.id}", p.specs.isNotEmpty())
        }
    }

    @Test
    fun reviews_wereMigrated() {
        assertEquals(2, findCatalogProduct(1)!!.reviews.size)
        assertEquals(1, findCatalogProduct(13)!!.reviews.size)
        assertEquals(1, findCatalogProduct(16)!!.reviews.size)
    }

    @Test
    fun alcoholItems_areAgeRestricted() {
        for (id in listOf(14, 15, 16)) {
            assertTrue("product $id must be age-restricted", findCatalogProduct(id)!!.ageRestricted)
        }
    }

    @Test
    fun groceryItems_areNotAgeRestricted() {
        for (id in 1..13) {
            assertFalse("product $id must not be age-restricted", findCatalogProduct(id)!!.ageRestricted)
        }
    }

    @Test
    fun price_isAuthoritative_andParsesToAmount() {
        val bourbon = findCatalogProduct(16)!!
        assertEquals("Old Oak Bourbon", bourbon.name)
        assertEquals("42.00", bourbon.price)
        assertEquals(42.0, bourbon.price.toDouble(), 0.0001)
    }

    @Test
    fun unknownId_returnsNull() {
        assertNull(findCatalogProduct(0))
        assertNull(findCatalogProduct(17))
        assertNull(findCatalogProduct(-1))
    }
}
