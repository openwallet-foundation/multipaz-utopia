# Utopia Theme

One design system for every Utopia service.

**To change the appearance of the entire universe, edit one file** —
`common/resources/www/utopia-theme.css` that defines the active
palette.

## Palettes

A palette owns the **complete** look — color, type, shape, elevation and
density — as a flat set of `--utopia-*` custom properties.

To edit the theme, change the values. Define **every** token the contract
lists — a missing one leaves its `var()` unresolved and that rule silently
drops.

Two tokens are worth knowing about when editing a palette:

- **`--utopia-radius-control`** is the lever that decides whether buttons,
  inputs, tags and chips read as soft rectangles (`8px`) or pills
  (`999px`). Every control across all six surfaces takes it.
- **`--utopia-emphasis`** is a *text* tone (prices, eyebrows) while
  **`--utopia-emphasis-fill`** / **`--utopia-on-emphasis`** are the *fill* and
  the ink that sits on it.

## Shared chrome

`utopia-chrome.js` mounts the sticky Utopia header (brand mark, demo pill,
cross-service nav, wallet signpost) and the footer onto any page. Include it once:

```html
<script>window.UTOPIA_SERVICE = "upay";</script>   <!-- optional; else inferred -->
<script src="utopia-chrome.js"></script>
```

It resolves its own sibling stylesheet from `document.currentScript.src`, so it
works from a service classpath or the nginx static root. Nav links are the
absolute deployment paths (`/registry/`, `/dmv/`, …); when the page is served
from `localhost` on a known development port it switches to the matching port
map automatically, so `./gradlew :…:run` links work too. Override with
`window.UTOPIA_NAV`.

Marketplace and UPay own their markup and carry that tag in it. The Registry,
the DMV and the Bank of Utopia do not — their pages come out of a library jar,
and the tag reaches them through the `custom_head_html` setting instead. See
[The chrome, on pages this repo does not own](#the-chrome-on-pages-this-repo-does-not-own).

## Layout

```
shared/theme/
├── common/resources/www/
│   ├── utopia-theme.css     the palette
│   ├── utopia-base.css      element defaults built on the tokens
│   ├── utopia-chrome.js     mounts the shared header + footer
│   └── utopia-chrome.css    styles for that chrome
├── openid4vci/resources/www/
│   └── style.css            restyle of the DMV / Bank of Utopia issuer pages
└── records/resources/www/
    └── style.css            restyle of the Registry's legacy pages
```

Three copy-roots rather than one, because `style.css` must land **only** where it
is meant to shadow a library jar. UPay already owns a `www/style.css` of its own,
so a single shared root would clobber it.

Each root contains a `resources/` directory, mirroring the layout Gradle expects,
so a `from(...)` needs no `into(...)`.

## How it reaches each service

`serveResources()` (multipaz-server, `resources.kt`) answers every asset request
with `getResourceAsStream("/resources/www/<path>")` and takes the **first match on
the classpath**. Two facts make that useful:

- Gradle puts a project's own resource output ahead of its dependency JARs.
- `deployment/docker/start-servers.sh` launches each service with
  `-cp /app/jars/<instance>.jar:/app/jars/multipaz-<service>.jar:/app/libs/*` —
  the instance jar first.

So a file this module copies into a backend's resources **wins over the same path
in a library jar**. That is what lets the Registry's legacy pages, the DMV and the
Bank of Utopia be styled at all: their `style.css` lives in `multipaz-records.jar`
and `multipaz-openid4vci.jar`, and this module replaces it wholesale.

| Service                  | Gets                    | Result                                  |
|--------------------------|-------------------------|-----------------------------------------|
| `marketplace/backend`    | `common`                | tokens available to `marketplace.css`   |
| `upay/backend`           | `common`                | tokens available to its own `style.css` |
| `registry/backend`       | `common` + `records`    | **shadows** `multipaz-records.jar`      |
| `dmv/backend`            | `common` + `openid4vci` | **shadows** `multipaz-openid4vci.jar`   |
| `bank_of_utopia/backend` | `common` + `openid4vci` | **shadows** `multipaz-openid4vci.jar`   |

The Registry **React** front-end is the exception: nginx serves it from
`/app/web`, so it never touches the classpath. Its `build.gradle.kts` stages
`utopia-theme.css` into the browser distribution with the `stageUtopiaTheme` task
instead, and adds the staged directory to the dev server's `static` list so
`jsBrowserDevelopmentRun` matches production.

### The chrome, on pages this repo does not own

The **HTML** of those three services is a different matter — it lives in the
same jars, and there is no markup here to edit. `serveResources()` injects the
`custom_head_html` setting immediately before each page's `</head>`, so the
shared chrome is attached from configuration instead:

```json
"custom_head_html": "<script src=\"utopia-chrome.js\"></script>"
```

That line sits in the `default_configuration.json` of the Registry, the DMV and
the Bank of Utopia, and it is the whole of the wiring. The script itself is an
ordinary classpath asset, resolved like any other, so it lands in the same place
in the `<head>` it would have occupied had the markup been written by hand.

Earlier revisions of this module vendored the jar's seven page shells verbatim
and edited a script tag into each copy. Nothing checked that the copies stayed
in step with the jar, and by the time they were removed they had already drifted
apart on whitespace. Injection replaces all seven files, and covers pages nobody
thought to vendor — `paint.html` in the openid4vci jar, for one.

Note that `custom_head_html` needs a `multipaz-server` that carries the setting.
An older snapshot ignores it silently: the pages build and serve, they simply
arrive without the header and footer.


## Using the tokens

Stylesheets that already have a design of their own import the tokens **only**:

```css
@import "utopia-theme.css";
```

Marketplace, UPay and the Registry React app do this. Marketplace and UPay keep
their existing local variable names as thin aliases (`--bg: var(--utopia-bg)`),
so several hundred lines of downstream rules needed no edit.

Stylesheets for pages that ship with almost no styling of their own — the two
shadowing sheets in this module — import the base instead, which pulls in the
tokens for them:

```css
@import "utopia-base.css";
```

`utopia-theme.css` and the palettes deliberately set **no element styles**, so
importing them can never disturb an existing layout. Everything structural lives
in `utopia-base.css`, which only the admin pages pull in.

The resulting import chain is `style.css → utopia-base.css → utopia-theme.css`.
Each `@import` must be the first rule in its own file (comments
are fine before it), which is why the palette's Google Fonts import sits at the
very top of the palette file.

## Gotchas

- **Shadowing replaces, it does not merge.** `getResourceAsStream` returns the
  first match and stops, so the jar's own rules never load. Anything still needed
  has to be reproduced in the shadowing file.
- **Never set `display` on `.logged_in` / `.logged_out`.** `login.js` in both
  library jars toggles login state by injecting a `<style>` that sets
  `display: none` on one of them.
- **The shadowing sheets target markup owned by dependency JARs.** A snapshot
  bump that renames a class will silently drop styling rather than fail a build.
  The class names each file relies on are listed in its header comment.
- **`var()` does not reach into `data:` URIs.** UPay's `<select>` chevron is an
  inline SVG with the ink-soft color written out; keep it in sync by hand.
- **A palette may pull webfonts.** `palette-organic.css` imports Caprasimo and
  Figtree from `fonts.googleapis.com` at runtime. In an offline or airgapped
  deployment that request fails and the pages fall back to the stacks declared
  alongside it (Georgia / system-ui), which is a degraded but intact look.
