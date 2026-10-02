package org.multipaz.marketplace.server

import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** `GET /catalog` is what the web storefront and the MCP storefront both render from. */
class CatalogRouteTest {

    @Test
    fun getCatalog_servesTheValidatedCatalogAsJson() = testApplication {
        application {
            routing { get("/catalog") { marketplaceCatalogRoute(call) } }
        }

        val res = client.get("/catalog")

        assertEquals(HttpStatusCode.OK, res.status)
        assertTrue(res.contentType()!!.match(ContentType.Application.Json))
        val served = MarketplaceCatalog.parse(res.bodyAsText())
        assertEquals(6, served.aisles.size)
        assertEquals(16, served.products.size)
        assertTrue(served.products.first { it.id == 16 }.ageRestricted)
        assertEquals("42.00", served.products.first { it.id == 16 }.price)
    }
}
