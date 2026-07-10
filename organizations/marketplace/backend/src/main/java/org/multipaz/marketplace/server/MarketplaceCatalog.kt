package org.multipaz.marketplace.server

/**
 * A single storefront product, as the server knows it.
 *
 * @param price decimal string in USD (e.g. "42.00"); parsed to the payment amount at checkout.
 * @param ageRestricted whether checkout must request an identity/age credential in addition to payment.
 */
data class MarketplaceProduct(
    val id: Int,
    val name: String,
    val price: String,
    val ageRestricted: Boolean,
)

// ---------------------------------------------------------------------------
// Server-authoritative catalog.
//
// The browser sends only a productId at checkout; price and the age-restricted
// flag are looked up here and are never trusted from the request body. This is
// what stops a crafted POST from buying the $42 bourbon for $0.01 or skipping
// the age check by flipping a flag.
//
// This mirrors catalog.js (the storefront's source of truth) — the id, price,
// and ageRestricted flag of every product MUST stay in sync with that file.
// (A future REST API will make one of the two the single source; until then,
// keep them aligned.)
// ---------------------------------------------------------------------------

private val MARKETPLACE_CATALOG: Map<Int, MarketplaceProduct> = listOf(
    // Fresh Produce
    MarketplaceProduct(1, "Red Delicious Apples", "4.50", ageRestricted = false),
    MarketplaceProduct(2, "Organic Bananas", "2.20", ageRestricted = false),
    MarketplaceProduct(3, "Vine Tomatoes", "3.80", ageRestricted = false),
    // Bakery
    MarketplaceProduct(4, "Artisan Sourdough", "5.00", ageRestricted = false),
    MarketplaceProduct(5, "Butter Croissants", "4.20", ageRestricted = false),
    // Dairy & Eggs
    MarketplaceProduct(6, "Whole Milk", "1.80", ageRestricted = false),
    MarketplaceProduct(7, "Free-Range Eggs", "3.60", ageRestricted = false),
    MarketplaceProduct(8, "Aged Cheddar", "6.40", ageRestricted = false),
    // Pantry
    MarketplaceProduct(9, "Spaghetti No. 5", "1.60", ageRestricted = false),
    MarketplaceProduct(10, "Extra Virgin Olive Oil", "9.50", ageRestricted = false),
    MarketplaceProduct(11, "Honey Oat Cereal", "4.00", ageRestricted = false),
    // Beverages
    MarketplaceProduct(12, "Fresh Orange Juice", "3.90", ageRestricted = false),
    MarketplaceProduct(13, "Ground Coffee", "8.20", ageRestricted = false),
    // Beer, Wine & Spirits (age-restricted)
    MarketplaceProduct(14, "Craft Lager", "11.00", ageRestricted = true),
    MarketplaceProduct(15, "Reserve Red Wine", "18.00", ageRestricted = true),
    MarketplaceProduct(16, "Old Oak Bourbon", "42.00", ageRestricted = true),
).associateBy { it.id }

/** Looks up a product by its catalog id, or null if the id is unknown. */
fun findCatalogProduct(id: Int): MarketplaceProduct? = MARKETPLACE_CATALOG[id]
