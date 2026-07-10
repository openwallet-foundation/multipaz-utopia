// ---------------------------------------------------------------------------
// Utopia Marketplace — product detail page + checkout orchestration.
// The catalog itself lives in catalog.js (shared with index.html).
// ---------------------------------------------------------------------------

function aisleName(aisleId) {
    const a = AISLES.find(function (x) { return x.id === aisleId; });
    return a ? a.name : "";
}

// ---------------------------------------------------------------------------
// Page initialisation
// ---------------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", function () {
    const params = new URLSearchParams(location.search);
    const id = parseInt(params.get("id")) || 1;
    const product = findProduct(id) || PRODUCTS[0];
    window._currentProduct = product;

    document.getElementById("product-image").src = product.image;
    document.getElementById("product-image").alt = product.name;
    document.getElementById("product-name").textContent = product.name;
    document.getElementById("product-description").textContent = product.description;
    document.getElementById("product-price").textContent = "$" + product.price;
    document.getElementById("product-unit").textContent = product.unit;
    document.getElementById("note-body").textContent = product.note;
    document.title = product.name + " — Utopia Marketplace";

    // Label: flag age-restricted items, otherwise show the aisle.
    document.getElementById("product-label").textContent =
        product.ageRestricted ? "AGE-RESTRICTED · 18+" : aisleName(product.aisle);

    // Checkout note depends on whether an age check is needed.
    document.getElementById("delivery-note").textContent = product.ageRestricted
        ? "Age (18+) & payment verification required at checkout."
        : "Secure payment verification at checkout.";

    // Highlights.
    const hl = document.getElementById("product-highlights");
    product.highlights.forEach(function (h) {
        const tag = document.createElement("span");
        tag.className = "flavor-tag";
        tag.textContent = h;
        hl.appendChild(tag);
    });

    // Specs — rendered generically from the product's spec map.
    const specsEl = document.getElementById("product-specs");
    Object.keys(product.specs).forEach(function (label) {
        const cell = document.createElement("div");
        cell.innerHTML =
            '<p class="meta-label">' + escapeHtml(label) + "</p>" +
            '<p class="meta-value">' + escapeHtml(product.specs[label]) + "</p>";
        specsEl.appendChild(cell);
    });
});

// ---------------------------------------------------------------------------
// Checkout button handler
// ---------------------------------------------------------------------------
async function onBuyClick() {
    const product = window._currentProduct;
    if (!product) return;

    document.getElementById("loading-text").textContent = product.ageRestricted
        ? "Verifying age & payment…"
        : "Verifying payment…";
    showLoading(true);
    document.getElementById("buy-btn").disabled = true;

    try {
        // Step 1: Get DCQL + transaction_data from backend. We send only the
        // productId — the backend looks up the name, price, and whether the item
        // is age-restricted from its own catalog, so those values can't be
        // tampered with from the client.
        const checkoutResp = await fetch("checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: product.id })
        });
        if (!checkoutResp.ok) {
            throw new Error("Checkout request failed (" + checkoutResp.status + ")");
        }
        const checkoutData = await checkoutResp.json();

        // Step 2: Present credentials via DC API (multipazVerifyCredentials is from verify_credentials.js)
        const result = await multipazVerifyCredentials(checkoutData);

        showLoading(false);

        // Step 3: Display result.
        //   1. Assistant success — { approved: true, holderName, issuerName }
        //   2. Assistant decline — { approved: false, error: "<reason>" }
        //   3. Verifier-level failure — { error: "<code>", error_description: "<detail>" }
        if (result && result.approved) {
            let body =
                "<p>Welcome, <strong>" + escapeHtml(result.holderName) + "</strong>.</p>" +
                "<p>Your order for <strong>" + escapeHtml(product.name) + "</strong> " +
                "($" + escapeHtml(product.price) + ") has been recorded.</p>" +
                "<p>Payment via <em>" + escapeHtml(result.issuerName) + "</em>.</p>";
            if (product.ageRestricted) {
                body += "<p class=\"age-ok\">Age verified — thanks for shopping responsibly.</p>";
            }
            showResult(true, "Checkout Complete", body);
        } else if (result && result.error_description) {
            showError("Verification Failed",
                "<p>The credential could not be verified.</p>",
                result.error_description + (result.error ? " (" + result.error + ")" : "")
            );
        } else if (result && result.error) {
            showError("Checkout Declined", "<p>" + escapeHtml(result.error) + "</p>", null);
        } else {
            showError("Checkout Declined",
                "<p>Verification could not be completed. Please try again.</p>", null
            );
        }
    } catch (err) {
        showLoading(false);
        if (isCancellation(err)) {
            showError("Presentation Cancelled",
                "<p>The credential request was dismissed before it could be completed.</p>", null
            );
        } else {
            showError("Something Went Wrong",
                "<p>The checkout could not be processed due to an unexpected error.</p>",
                err && (err.message || String(err))
            );
        }
    } finally {
        document.getElementById("buy-btn").disabled = false;
    }
}

// Treat user-dismissed / aborted credential prompts as cancellations rather than errors.
function isCancellation(err) {
    if (!err) return false;
    const name = err.name || "";
    const msg = (err.message || String(err)).toLowerCase();
    return name === "NotAllowedError" || name === "AbortError" ||
        msg.includes("cancel") || msg.includes("abort") || msg.includes("dismiss");
}

// ---------------------------------------------------------------------------
// Overlay helpers
// ---------------------------------------------------------------------------
function showLoading(visible) {
    document.getElementById("loading-overlay").classList.toggle("hidden", !visible);
}

function showResult(approved, title, bodyHtml) {
    const icon = approved
        ? '<div class="result-icon result-icon-success" aria-hidden="true">&#10003;</div>'
        : '<div class="result-icon result-icon-error" aria-hidden="true">&#33;</div>';
    const box = document.getElementById("result-box");
    box.className = "result-box " + (approved ? "result-approved" : "result-declined");
    document.getElementById("result-content").innerHTML =
        icon + "<h2>" + escapeHtml(title) + "</h2>" + bodyHtml;
    document.getElementById("result-overlay").classList.remove("hidden");
}

// Renders a declined/error dialog with an optional technical-detail block.
function showError(title, bodyHtml, detail) {
    let html = bodyHtml;
    if (detail) {
        html += '<div class="result-detail">' + escapeHtml(detail) + "</div>";
    }
    showResult(false, title, html);
}

function closeOverlay() {
    document.getElementById("result-overlay").classList.add("hidden");
}
