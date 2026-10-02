package org.multipaz.marketplace.server

import io.ktor.http.ContentType
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respondText
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.math.BigDecimal

// ---------------------------------------------------------------------------
// Server-authoritative catalog — the single source for the storefront web pages
// (fetched from GET /catalog), the MCP storefront (same endpoint), and checkout.
//
// The browser sends only a productId at checkout; price and the age-restricted
// flag are looked up here and are never trusted from the request body. This is
// what stops a crafted POST from buying the $42 bourbon for $0.01 or skipping
// the age check by flipping a flag.
// ---------------------------------------------------------------------------

/** One storefront aisle; the order of [MarketplaceCatalog.aisles] is the display order. */
@Serializable
data class CatalogAisle(val id: String, val name: String, val blurb: String)

/** A customer review shown by the MCP storefront's `get-product-reviews` tool. */
@Serializable
data class CatalogReview(val author: String, val rating: Int, val text: String)

/**
 * A single storefront product, as the server knows it.
 *
 * @param price decimal string in USD (e.g. "42.00"); parsed to the payment amount at checkout.
 * @param ageRestricted whether checkout must request an identity/age credential (18+) in addition to payment.
 * @param tint palette index 1–6; the web storefront renders it as `var(--utopia-tint-N)`.
 */
@Serializable
data class CatalogProduct(
    val id: Int,
    val aisle: String,
    val name: String,
    val price: String,
    val ageRestricted: Boolean,
    val unit: String,
    val tagline: String,
    val description: String,
    val highlights: List<String> = emptyList(),
    val specs: Map<String, String> = emptyMap(),
    val note: String,
    val glyph: String,
    val tint: Int,
    val reviews: List<CatalogReview> = emptyList(),
)

@Serializable
data class MarketplaceCatalog(
    val currency: String,
    val aisles: List<CatalogAisle>,
    val products: List<CatalogProduct>,
) {
    companion object {
        // encodeDefaults so GET /catalog always carries every field (e.g. an empty `reviews`).
        private val json = Json { encodeDefaults = true }
        private val PRICE_FORMAT = Regex("""^\d+(\.\d{1,2})?$""")

        /**
         * Decodes and validates a catalog.
         *
         * @throws IllegalArgumentException if the JSON is malformed or any product breaks a rule
         *   (non-USD currency, duplicate aisle or product id, unknown aisle, non-positive or malformed price, tint outside 1–6,
         *   review rating outside 1–5, or no products at all).
         */
        fun parse(text: String): MarketplaceCatalog =
            json.decodeFromString(serializer(), text).also { it.validate() }

        /** Serializes a catalog with every field present. */
        fun encode(catalog: MarketplaceCatalog): String = json.encodeToString(serializer(), catalog)
    }

    private fun validate() {
        require(currency == "USD") { "Catalog currency is '$currency'; checkout only supports USD" }
        require(products.isNotEmpty()) { "Catalog has no products" }
        val aisleIds = mutableSetOf<String>()
        for (a in aisles) {
            require(aisleIds.add(a.id)) { "Duplicate aisle id ${a.id}" }
        }
        val seen = mutableSetOf<Int>()
        for (p in products) {
            require(seen.add(p.id)) { "Duplicate product id ${p.id}" }
            require(p.aisle in aisleIds) { "Product ${p.id} references unknown aisle '${p.aisle}'" }
            require(PRICE_FORMAT.matches(p.price) && BigDecimal(p.price) > BigDecimal.ZERO) {
                "Product ${p.id} has invalid price '${p.price}'"
            }
            require(p.tint in 1..6) { "Product ${p.id} has tint ${p.tint}; expected 1–6" }
            for (r in p.reviews) {
                require(r.rating in 1..5) { "Product ${p.id} has a review with rating ${r.rating}; expected 1–5" }
            }
        }
    }
}

private const val CATALOG_RESOURCE = "/resources/catalog.json"

/**
 * The catalog, loaded from the classpath and validated on first access. `Main` touches it before the
 * server starts so a missing or invalid `catalog.json` fails startup rather than the first checkout.
 */
val marketplaceCatalog: MarketplaceCatalog by lazy {
    val text = MarketplaceCatalog::class.java.getResourceAsStream(CATALOG_RESOURCE)
        ?.use { it.readBytes().decodeToString() }
        ?: error("Catalog resource $CATALOG_RESOURCE not found on the classpath")
    MarketplaceCatalog.parse(text)
}

private val productsById: Map<Int, CatalogProduct> by lazy { marketplaceCatalog.products.associateBy { it.id } }

/** Looks up a product by its catalog id, or null if the id is unknown. */
fun findCatalogProduct(id: Int): CatalogProduct? = productsById[id]

private val marketplaceCatalogJson: String by lazy { MarketplaceCatalog.encode(marketplaceCatalog) }

/**
 * `GET /catalog` — the validated catalog, re-serialized (never the raw resource bytes), for the web
 * storefront and the MCP storefront to render from.
 */
suspend fun marketplaceCatalogRoute(call: ApplicationCall) {
    call.respondText(marketplaceCatalogJson, ContentType.Application.Json)
}
