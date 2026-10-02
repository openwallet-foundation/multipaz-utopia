// ---------------------------------------------------------------------------
// Utopia Marketplace — catalog loader (shared by index.html and product.html)
//
// The catalog is owned by the backend: MarketplaceCatalog.kt loads
// backend/src/main/resources/resources/catalog.json and serves it at
// GET /catalog. This file holds no product data — both pages fetch it, and the
// MCP storefront renders from the same endpoint.
// ---------------------------------------------------------------------------

let catalogPromise = null;

// Fetches the catalog once per page load. Relative URL, so it resolves to
// /marketplace/catalog behind nginx and /catalog on a local run. A failed load
// is not cached, so a retry fetches again.
function loadCatalog() {
    if (!catalogPromise) {
        catalogPromise = fetch("catalog", { headers: { Accept: "application/json" } })
            .then(function (res) {
                if (!res.ok) throw new Error("catalog request failed (" + res.status + ")");
                return res.json();
            })
            .catch(function (err) {
                catalogPromise = null;
                throw err;
            });
    }
    return catalogPromise;
}

// Look up a single product by id.
function findProduct(catalog, id) {
    return catalog.products.find(function (p) { return p.id === id; }) || null;
}

// Product artwork is a palette tint plus the product's emoji. The catalog
// stores the palette index; the active palette (--utopia-tint-1..6) supplies
// the colour, so artwork re-skins with everything else.
function tintVar(n) {
    return "var(--utopia-tint-" + n + ")";
}

// Replace a status line's content with a load-failure message and a retry link.
function renderCatalogError(el, retry) {
    el.innerHTML = "Couldn’t load the catalog — <a href=\"#\" class=\"mk-retry\">try again</a>";
    el.hidden = false;
    el.querySelector(".mk-retry").addEventListener("click", function (e) {
        e.preventDefault();
        retry();
    });
}

// Shared HTML-escaping helper (used by index.html and marketplace.js).
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
