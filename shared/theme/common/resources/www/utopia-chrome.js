/*
 * Utopia shared chrome
 *
 * Include it once per page:
 *
 *     <script src="utopia-chrome.js"></script>
 *
 * It resolves its own sibling stylesheet from document.currentScript.src, so
 * it works unchanged whether the page is served from a service's classpath
 * (/dmv/, /registry/, …) or from the nginx static root.
 *
 * Where the nav points
 *
 * Behind nginx every service lives under a path prefix, so absolute links are
 * correct and are the default. On a local `./gradlew :…:run` each service is
 * a bare port instead, and those absolute paths would 404 — so when the page
 * is being served from localhost on one of the known development ports, the
 * nav switches to the matching port map automatically.
 *
 * Override either behaviour explicitly by setting, BEFORE this script loads:
 *
 *     <script>window.UTOPIA_NAV = { registry: "…", marketplace: "…" };</script>
 *
 * and mark which entry is the current service with:
 *
 *     <script>window.UTOPIA_SERVICE = "upay";</script>
 *
 * (omit it and the current service is inferred from the URL).
 */
(function () {
    "use strict";

    if (window.__utopiaChromeMounted) return;
    window.__utopiaChromeMounted = true;

    var script = document.currentScript;
    var base = script ? script.src.slice(0, script.src.lastIndexOf("/") + 1) : "";

    // Order matters: this is the order the nav renders in. The ports are the ones each service
    // listens on, both in the container bundle and when run on its own from Gradle.
    var SERVICES = [
        { key: "registry",       label: "Registry",    path: "/registry/",        ports: [8004] },
        { key: "dmv",            label: "DMV",         path: "/dmv/",             ports: [8002] },
        { key: "bank_of_utopia", label: "Bank",        path: "/bank_of_utopia/",  ports: [8017] },
        { key: "marketplace",    label: "Marketplace", path: "/marketplace/",     ports: [8010] },
        { key: "upay",           label: "UPay",        path: "/upay/",            ports: [8009] }
    ];

    function servesPort(svc, port) {
        return svc.ports.some(function (p) { return String(p) === port; });
    }

    var isLocalPort = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) &&
        SERVICES.some(function (svc) { return servesPort(svc, location.port); });

    function hrefFor(svc) {
        var override = window.UTOPIA_NAV && window.UTOPIA_NAV[svc.key];
        if (override) return override;
        if (isLocalPort) {
            // Link to whichever port this service is actually reachable on
            var port = servesPort(svc, location.port) ? location.port : svc.ports[0];
            return location.protocol + "//" + location.hostname + ":" + port + "/";
        }
        return svc.path;
    }

    function currentKey() {
        if (window.UTOPIA_SERVICE) return window.UTOPIA_SERVICE;
        var match = null;
        SERVICES.forEach(function (svc) {
            if (isLocalPort) {
                if (servesPort(svc, location.port)) match = svc.key;
            } else if (location.pathname.indexOf(svc.path) === 0) {
                match = svc.key;
            }
        });
        return match;
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function ensureStylesheet() {
        var href = base + "utopia-chrome.css";
        var already = Array.prototype.some.call(
            document.querySelectorAll('link[rel="stylesheet"]'),
            function (link) { return link.href === href; }
        );
        if (already) return;
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);
    }

    function buildHeader() {
        var header = el("header", "utopia-chrome");
        var inner = el("div", "utopia-chrome-inner");

        // The brand goes to the Utopia landing page, which nginx serves at the
        // root. On a bare development port there is no landing page, so "/"
        // simply returns to that service's own home.
        var home = el("a", "utopia-brand");
        home.href = window.UTOPIA_HOME || "/";
        home.appendChild(el("span", "utopia-brand-mark", "U"));
        home.appendChild(el("span", "utopia-brand-name", "Utopia"));
        inner.appendChild(home);

        inner.appendChild(el("span", "utopia-demo-pill", "Fictional state \u00B7 demo only"));

        var active = currentKey();
        var nav = el("nav", "utopia-nav");
        nav.setAttribute("aria-label", "Utopia services");
        SERVICES.forEach(function (svc) {
            var a = el("a", null, svc.label);
            a.href = hrefFor(svc);
            if (svc.key === active) a.setAttribute("aria-current", "page");
            nav.appendChild(a);
        });
        inner.appendChild(nav);

        header.appendChild(inner);
        return header;
    }

    function buildFooter() {
        var footer = el("footer", "utopia-footer");
        footer.appendChild(el("span", null,
            "Utopia is an imaginary jurisdiction built to demonstrate digital credentials. " +
            "No real identities, money, goods or licences are involved."));
        var link = el("a", null, "Multipaz \u2197");
        link.href = "https://developer.multipaz.org";
        link.rel = "noopener";
        footer.appendChild(link);
        return footer;
    }

    function mount() {
        if (document.querySelector(".utopia-chrome")) return;
        ensureStylesheet();
        document.body.insertBefore(buildHeader(), document.body.firstChild);
        document.body.appendChild(buildFooter());
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", mount);
    } else {
        mount();
    }
})();
