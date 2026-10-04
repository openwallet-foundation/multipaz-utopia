// A small browser-facing window into the real MCP storefront. Product data comes
// from the Marketplace catalog; the Node MCP route re-prices and persists the order
// before sending the buyer to its normal credential/payment checkout page.
(function () {
    var cart = new Map();
    var products = [];

    function money(value) { return "$" + Number(value).toFixed(2); }

    function render() {
        var picker = document.getElementById("mcp-product-picker");
        picker.innerHTML = "";
        products.forEach(function (product) {
            var quantity = cart.get(product.id) || 0;
            var card = document.createElement("article");
            card.className = "mk-mcp-product";
            card.innerHTML =
                '<div class="mk-mcp-product-art" style="background:' + tintVar(product.tint) + '">' +
                    '<span aria-hidden="true">' + escapeHtml(product.glyph) + "</span>" +
                "</div>" +
                '<p class="mk-mcp-product-meta">' + escapeHtml(product.tagline) + "</p>" +
                "<h3>" + escapeHtml(product.name) + "</h3>" +
                '<p class="mk-mcp-product-detail">' + escapeHtml(product.description) + "</p>" +
                '<div class="mk-mcp-product-footer"><strong>' + money(product.price) + "</strong>" +
                    '<button type="button" data-product-id="' + product.id + '">' +
                        (quantity ? "Add another (" + quantity + ")" : "Add") +
                    "</button></div>";
            picker.appendChild(card);
        });

        picker.querySelectorAll("button[data-product-id]").forEach(function (button) {
            button.addEventListener("click", function () {
                var id = Number(button.dataset.productId);
                cart.set(id, (cart.get(id) || 0) + 1);
                render();
            });
        });

        var itemCount = 0;
        var total = 0;
        cart.forEach(function (quantity, id) {
            var product = products.find(function (p) { return p.id === id; });
            itemCount += quantity;
            total += Number(product.price) * quantity;
        });
        document.getElementById("mcp-cart-total").textContent = itemCount + " item" + (itemCount === 1 ? "" : "s") + " · " + money(total);
        document.getElementById("mcp-cart-summary").textContent = itemCount ? itemCount + " item" + (itemCount === 1 ? "" : "s") + " ready for checkout" : "Your cart is empty";
        document.getElementById("mcp-checkout-button").disabled = itemCount === 0;
    }

    async function checkout() {
        var button = document.getElementById("mcp-checkout-button");
        var status = document.getElementById("mcp-demo-status");
        var items = Array.from(cart.entries()).map(function (entry) {
            return { productId: "p" + entry[0], quantity: entry[1] };
        });
        button.disabled = true;
        status.hidden = false;
        status.textContent = "Creating your real checkout…";
        try {
            var response = await fetch("/mcp/demo-checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items: items })
            });
            var data = await response.json();
            if (!response.ok) throw new Error(data.error || "Checkout could not be created.");
            window.location.assign(data.checkoutUrl);
        } catch (err) {
            status.textContent = err && err.message ? err.message : "Checkout could not be created.";
            button.disabled = false;
        }
    }

    document.querySelector("[data-scroll-to]").addEventListener("click", function () {
        document.getElementById(this.dataset.scrollTo).scrollIntoView({ behavior: "smooth", block: "start" });
    });
    document.getElementById("mcp-checkout-button").addEventListener("click", checkout);

    loadCatalog().then(function (catalog) {
        products = catalog.products;
        document.getElementById("mcp-demo-status").hidden = true;
        render();
    }).catch(function (err) {
        console.error(err);
        renderCatalogError(document.getElementById("mcp-demo-status"), function () { window.location.reload(); });
    });
}());
