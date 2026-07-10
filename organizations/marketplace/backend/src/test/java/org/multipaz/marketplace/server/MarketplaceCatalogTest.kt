package org.multipaz.marketplace.server

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pins the server-authoritative catalog. Checkout derives the price and the age-restricted flag
 * from these values (by productId), so they must not silently drift or a crafted request could buy
 * alcohol without an age check or a real item at the wrong amount.
 */
class MarketplaceCatalogTest {

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
