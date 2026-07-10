// ---------------------------------------------------------------------------
// Utopia Marketplace — product catalog (shared by index.html and product.html)
//
// Source of truth for the storefront. Each product carries an `ageRestricted`
// flag: only age-restricted items (the Beer, Wine & Spirits aisle) trigger the
// mDL / eID age-verification step at checkout — everything else needs payment
// only. See marketplace.js (onBuyClick) and the backend MarketplaceHandler.
// ---------------------------------------------------------------------------

// Aisles in display order.
const AISLES = [
    { id: "produce",   name: "Fresh Produce",        blurb: "Picked at peak ripeness from local growers." },
    { id: "bakery",    name: "Bakery",               blurb: "Baked in-store every morning." },
    { id: "dairy",     name: "Dairy & Eggs",         blurb: "Chilled, fresh, and farm-sourced." },
    { id: "pantry",    name: "Pantry",               blurb: "Everyday staples for the cupboard." },
    { id: "beverages", name: "Beverages",            blurb: "Juices, coffee, and refreshments." },
    { id: "spirits",   name: "Beer, Wine & Spirits", blurb: "Age-restricted — a quick credential check at checkout." },
];

// Self-contained product images — generated here, no external image files.
// Each is a clean SVG tile: a category-tinted diagonal gradient + the product's
// emoji, centred, embedded as a data URI.
//
// The emoji fills a comfortable share of the tile (font-size 150 in the 400-unit
// box). Colour-emoji fonts are bitmaps (~128px native), so a glyph blurs once
// displayed much larger than that — but both surfaces show the tile at/under its
// native 400px (cards ~210px; the detail preview is capped at 340px in the CSS),
// so the tile is only ever downscaled and the glyph stays crisp.
function tile(emoji, bg) {
    const svg =
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'>" +
        "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>" +
        "<stop offset='0' stop-color='" + bg[0] + "'/>" +
        "<stop offset='1' stop-color='" + bg[1] + "'/>" +
        "</linearGradient></defs>" +
        "<rect width='400' height='400' fill='url(#g)'/>" +
        "<text x='200' y='205' font-size='150' text-anchor='middle' " +
        "dominant-baseline='central'>" + emoji + "</text>" +
        "</svg>";
    return "data:image/svg+xml," + encodeURIComponent(svg);
}

const PRODUCTS = [
    // ---- Fresh Produce ---------------------------------------------------
    {
        id: 1, aisle: "produce", ageRestricted: false,
        name: "Red Delicious Apples", price: "4.50", unit: "1 kg bag",
        tagline: "CRISP & SWEET",
        description: "Hand-picked orchard apples with a crisp bite and honeyed finish. Perfect for lunchboxes, baking, or a fresh afternoon snack.",
        highlights: ["Local Orchard", "Extra Crisp", "Rich in Fiber"],
        specs: { Aisle: "Fresh Produce", Weight: "1 kg (approx. 6)", Origin: "Utopia Valley Farms", Storage: "Cool & dry" },
        note: "Sourced within 50 miles and delivered daily — from tree to shelf in under 24 hours.",
        image: tile("🍎", ["#5e1414", "#9e2b24"]),
    },
    {
        id: 2, aisle: "produce", ageRestricted: false,
        name: "Organic Bananas", price: "2.20", unit: "bunch of 5",
        tagline: "FAIRTRADE",
        description: "Naturally ripened Fairtrade bananas, rich in potassium and ready to enjoy. A wholesome everyday staple for the whole family.",
        highlights: ["Organic", "Fairtrade", "Potassium"],
        specs: { Aisle: "Fresh Produce", Quantity: "Bunch of 5", Origin: "Certified Fairtrade", Storage: "Room temperature" },
        note: "Grown without synthetic pesticides and traded fairly to support the farmers who grow them.",
        image: tile("🍌", ["#6b4e07", "#a67c12"]),
    },
    {
        id: 3, aisle: "produce", ageRestricted: false,
        name: "Vine Tomatoes", price: "3.80", unit: "500 g",
        tagline: "ON THE VINE",
        description: "Plump, sun-ripened tomatoes still on the vine for maximum aroma and flavour. Ideal for salads, sauces, and slow-roasting.",
        highlights: ["Vine-Ripened", "Greenhouse Grown", "No Waxing"],
        specs: { Aisle: "Fresh Produce", Weight: "500 g", Origin: "Utopia Glasshouses", Storage: "Room temperature" },
        note: "Kept on the vine right up to the shelf so they keep ripening and never lose their scent.",
        image: tile("🍅", ["#5f1712", "#9c3128"]),
    },

    // ---- Bakery ----------------------------------------------------------
    {
        id: 4, aisle: "bakery", ageRestricted: false,
        name: "Artisan Sourdough", price: "5.00", unit: "800 g loaf",
        tagline: "SLOW-PROOFED",
        description: "A rustic sourdough with a deeply caramelised crust and open, airy crumb. Naturally leavened over 36 hours for a gentle tang.",
        highlights: ["36-Hour Proof", "No Additives", "Hand-Shaped"],
        specs: { Aisle: "Bakery", Weight: "800 g loaf", Origin: "In-store bakery", Storage: "Eat within 3 days" },
        note: "Made with just flour, water, and salt — our starter has been kept alive for over a decade.",
        image: tile("🍞", ["#4f3418", "#836237"]),
    },
    {
        id: 5, aisle: "bakery", ageRestricted: false,
        name: "Butter Croissants", price: "4.20", unit: "pack of 4",
        tagline: "ALL-BUTTER",
        description: "Flaky, golden croissants laminated with real French butter. Warm them for two minutes for a bakery-fresh breakfast at home.",
        highlights: ["All-Butter", "24 Layers", "Baked Fresh"],
        specs: { Aisle: "Bakery", Quantity: "Pack of 4", Origin: "In-store bakery", Storage: "Best same day" },
        note: "Folded by hand into twenty-four buttery layers, then baked in small batches through the morning.",
        image: tile("🥐", ["#5c4014", "#9a7434"]),
    },

    // ---- Dairy & Eggs ----------------------------------------------------
    {
        id: 6, aisle: "dairy", ageRestricted: false,
        name: "Whole Milk", price: "1.80", unit: "1 litre",
        tagline: "FARM FRESH",
        description: "Creamy whole milk from pasture-raised herds, gently pasteurised to keep its natural richness. A fridge essential.",
        highlights: ["Pasture-Raised", "Source of Calcium", "Recyclable Carton"],
        specs: { Aisle: "Dairy & Eggs", Volume: "1 litre", Origin: "Utopia Dairy Co-op", Storage: "Keep refrigerated" },
        note: "Collected from co-op farms each morning and on our shelves the same day.",
        image: tile("🥛", ["#33405c", "#5c6b8c"]),
    },
    {
        id: 7, aisle: "dairy", ageRestricted: false,
        name: "Free-Range Eggs", price: "3.60", unit: "dozen",
        tagline: "FREE-RANGE",
        description: "A dozen large free-range eggs with rich golden yolks, from hens that roam open pasture. Great for baking or a weekend fry-up.",
        highlights: ["Free-Range", "Large Grade", "High Protein"],
        specs: { Aisle: "Dairy & Eggs", Quantity: "12 large", Origin: "Meadowbrook Farm", Storage: "Keep refrigerated" },
        note: "Laid by hens with constant daytime access to open pasture — never caged.",
        image: tile("🥚", ["#5a4718", "#8f7538"]),
    },
    {
        id: 8, aisle: "dairy", ageRestricted: false,
        name: "Aged Cheddar", price: "6.40", unit: "250 g block",
        tagline: "MATURED 18M",
        description: "A firm, crumbly cheddar matured for eighteen months for a sharp, savoury depth and crystalline bite. Cheeseboard-ready.",
        highlights: ["18-Month Matured", "Vegetarian", "Award-Winning"],
        specs: { Aisle: "Dairy & Eggs", Weight: "250 g block", Origin: "West Utopia Creamery", Storage: "Keep refrigerated" },
        note: "Turned and graded by hand over a year and a half in the creamery's stone cellars.",
        image: tile("🧀", ["#6b4408", "#a8760f"]),
    },

    // ---- Pantry ----------------------------------------------------------
    {
        id: 9, aisle: "pantry", ageRestricted: false,
        name: "Spaghetti No. 5", price: "1.60", unit: "500 g",
        tagline: "BRONZE-CUT",
        description: "Bronze-die spaghetti with a rough texture that holds sauce beautifully. Made from durum wheat semolina and slow-dried.",
        highlights: ["Bronze-Cut", "Durum Wheat", "Slow-Dried"],
        specs: { Aisle: "Pantry", Weight: "500 g", Origin: "Casa Utopia", Storage: "Cool & dry" },
        note: "Drawn through traditional bronze dies for a rustic surface that clings to every sauce.",
        image: tile("🍝", ["#5a4416", "#8f6f2e"]),
    },
    {
        id: 10, aisle: "pantry", ageRestricted: false,
        name: "Extra Virgin Olive Oil", price: "9.50", unit: "500 ml",
        tagline: "COLD-PRESSED",
        description: "A first cold-pressed extra virgin olive oil with grassy, peppery notes. For finishing, dressing, and everyday cooking.",
        highlights: ["First Cold Press", "Single Estate", "Low Acidity"],
        specs: { Aisle: "Pantry", Volume: "500 ml", Origin: "Utopia Groves", Storage: "Away from light" },
        note: "Pressed within hours of harvest to lock in the fresh, peppery character of the olives.",
        image: tile("🫒", ["#3c4614", "#66751e"]),
    },
    {
        id: 11, aisle: "pantry", ageRestricted: false,
        name: "Honey Oat Cereal", price: "4.00", unit: "500 g box",
        tagline: "WHOLEGRAIN",
        description: "Crunchy wholegrain oat clusters with a touch of real honey. A wholesome start to the day, high in fibre and lightly sweet.",
        highlights: ["Wholegrain", "High Fibre", "Real Honey"],
        specs: { Aisle: "Pantry", Weight: "500 g box", Origin: "Utopia Mills", Storage: "Cool & dry" },
        note: "Baked into golden clusters with wholegrain oats and a drizzle of real honey — no artificial colours.",
        image: tile("🥣", ["#5a3d16", "#8f6a2e"]),
    },

    // ---- Beverages -------------------------------------------------------
    {
        id: 12, aisle: "beverages", ageRestricted: false,
        name: "Fresh Orange Juice", price: "3.90", unit: "1 litre",
        tagline: "NOT FROM CONCENTRATE",
        description: "Pure squeezed orange juice, not from concentrate, with the natural bits left in. Bright, zesty, and never sweetened.",
        highlights: ["Squeezed Fresh", "No Added Sugar", "Vitamin C"],
        specs: { Aisle: "Beverages", Volume: "1 litre", Origin: "Utopia Citrus", Storage: "Keep refrigerated" },
        note: "Pressed from ripe oranges and bottled the same day — nothing added, nothing concentrated.",
        image: tile("🧃", ["#6b2e08", "#a8560c"]),
    },
    {
        id: 13, aisle: "beverages", ageRestricted: false,
        name: "Ground Coffee", price: "8.20", unit: "500 g",
        tagline: "MEDIUM ROAST",
        description: "A smooth medium-roast blend of washed arabica beans with notes of cocoa and caramel. Ground for cafetière and filter.",
        highlights: ["100% Arabica", "Medium Roast", "Ethically Sourced"],
        specs: { Aisle: "Beverages", Weight: "500 g", Origin: "Highland co-ops", Storage: "Airtight, cool" },
        note: "Roasted in small batches and ground fresh so the aroma is still in the bag when you open it.",
        image: tile("☕", ["#2f1c10", "#5a3826"]),
    },

    // ---- Beer, Wine & Spirits  (age-restricted) --------------------------
    {
        id: 14, aisle: "spirits", ageRestricted: true,
        name: "Craft Lager", price: "11.00", unit: "6 × 330 ml",
        tagline: "CRISP PILSNER",
        description: "A crisp, golden craft lager with a clean malt backbone and gentle noble-hop bitterness. Best served ice-cold.",
        highlights: ["Small Batch", "4.8% ABV", "Unfiltered"],
        specs: { Aisle: "Beer, Wine & Spirits", Pack: "6 × 330 ml", ABV: "4.8% Vol.", Origin: "Utopia Craft Brewery" },
        note: "A quick age check at checkout keeps this one 18+. Brewed and canned in small batches for freshness.",
        image: tile("🍺", ["#5c400a", "#9a6b0e"]),
    },
    {
        id: 15, aisle: "spirits", ageRestricted: true,
        name: "Reserve Red Wine", price: "18.00", unit: "750 ml",
        tagline: "VINTAGE RESERVE",
        description: "A full-bodied reserve red with layers of dark berry, plum, and a soft oak finish. Cellared to round out its tannins.",
        highlights: ["Oak-Aged", "13.5% ABV", "Estate Bottled"],
        specs: { Aisle: "Beer, Wine & Spirits", Volume: "750 ml", ABV: "13.5% Vol.", Origin: "Utopia Estate Vineyard" },
        note: "Age verification required at checkout (18+). Matured in oak barrels before estate bottling.",
        image: tile("🍷", ["#3c0c20", "#6d1c3c"]),
    },
    {
        id: 16, aisle: "spirits", ageRestricted: true,
        name: "Old Oak Bourbon", price: "42.00", unit: "700 ml",
        tagline: "SMALL BATCH",
        description: "A small-batch straight bourbon aged in charred American white oak, with rich caramel, vanilla, and a long, warming finish.",
        highlights: ["Aged 12 Years", "45% ABV", "Charred Oak"],
        specs: { Aisle: "Beer, Wine & Spirits", Volume: "700 ml", ABV: "45% Vol.", Origin: "Kentucky, USA" },
        note: "Age verification required at checkout (18+). Rested twelve years in the highest rickhouse floors.",
        image: tile("🥃", ["#4d2610", "#8a4d1e"]),
    },
];

// Look up a single product by id.
function findProduct(id) {
    return PRODUCTS.find(function (p) { return p.id === id; }) || null;
}

// Shared HTML-escaping helper (used by index.html and marketplace.js).
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
