(function () {
    "use strict";

    var catalog = document.getElementById("catalog");

    function text(tag, className, value) {
        var element = document.createElement(tag);
        if (className) element.className = className;
        if (value != null) element.textContent = value;
        return element;
    }

    function appendMeta(card, app) {
        var fields = [
            ["Version", app.version],
            ["Released", app.releasedAt],
            ["Platform", app.platform],
            ["Android", app.minAndroid ? "Android " + app.minAndroid + "+" : null],
            ["Size", app.size],
            ["SHA-256", app.sha256],
            ["Signing key", app.signingCertificate]
        ].filter(function (field) { return field[1]; });
        if (!fields.length) return;

        var meta = text("dl", "app-meta");
        fields.forEach(function (field) {
            meta.appendChild(text("dt", null, field[0]));
            meta.appendChild(text("dd", null, field[1]));
        });
        card.appendChild(meta);
    }

    function appCard(app) {
        var card = text("article", "app-card");
        var badges = text("div", "badges");
        badges.appendChild(text("span", "badge", app.platform || "App"));
        badges.appendChild(text("span", "badge badge-demo",
            app.externalUrl ? "Maintained upstream" : "Utopia demo only"));
        if (app.status === "pending") badges.appendChild(text("span", "badge badge-pending", "Release pending"));
        card.appendChild(badges);
        card.appendChild(text("h3", null, app.name));
        card.appendChild(text("p", "app-description", app.description));
        appendMeta(card, app);

        if (app.externalUrl) {
            var external = text("a", "app-action", "View on Multipaz Apps");
            external.href = app.externalUrl;
            external.target = "_blank";
            external.rel = "noopener noreferrer";
            card.appendChild(external);
        } else if (app.webUrl) {
            var open = text("a", "app-action", "Open web app");
            open.href = app.webUrl;
            card.appendChild(open);
        } else if (app.apkUrl) {
            var download = text("a", "app-action", "Download APK");
            download.href = app.apkUrl;
            download.setAttribute("download", "");
            card.appendChild(download);
        } else {
            card.appendChild(text("p", "app-unavailable", "This app has not been published yet."));
        }
        return card;
    }

    function render(manifest) {
        var apps = Array.isArray(manifest.apps) ? manifest.apps : [];
        if (!apps.length) {
            catalog.appendChild(text("p", "empty", "No app releases are published yet. Check back after the first Utopia release is available."));
            return;
        }
        var grid = text("div", "app-grid");
        apps.forEach(function (app) { grid.appendChild(appCard(app)); });
        catalog.appendChild(grid);
    }

    fetch("/downloads/releases.json", { cache: "no-store" })
        .then(function (response) {
            if (!response.ok) throw new Error("Catalog unavailable");
            return response.json();
        })
        .then(render)
        .catch(function () {
            catalog.appendChild(text("p", "error", "The app catalog is temporarily unavailable. Please try again shortly."));
        });
}());
