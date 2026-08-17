# SEO — Applying Edits Where the HTML Is Born

## The problem

Weblay's default connector applies overrides **client-side**: the browser fetches
the manifest and swaps content after the page loads. Search engines and social
scrapers don't see those edits reliably:

- **Social / OG scrapers** (Facebook, Slack, LinkedIn, X/Twitter, WhatsApp) do
  **not run JavaScript** — they read the raw HTML. Edited titles, descriptions,
  and copy are invisible to them.
- **Googlebot** renders JS, but on a delayed, best-effort second pass. Freshly
  edited content can be missed or indexed late.

So for anything that matters to SEO or link previews, the edited content must be
present in the **initial HTML response**, not painted in afterward.

## The law

> You cannot make client-swapped content SEO-correct. The edit has to be in the
> HTML the server sends. That requires Weblay to touch **some point in the
> serving/build path.**

Pure "one script tag on a static host we don't control, never touch the source"
can't be made SEO-correct — it's a physical limit, not a bug.

## The solution: apply overrides at the serving boundary

Render edited HTML server-side by fetching the origin HTML, applying the
manifest with a real HTML parser, and returning the result to everyone —
crawlers included. One HTML-rewriting core, several delivery modes, so any
stack can adopt one:

| Mode | For | Effort | Status |
|---|---|---|---|
| **Reverse proxy** (`weblay-edge`) | any stack, zero app code | route traffic through it | **shipped** — `cmd/weblay-edge` |
| **Snapshot export** | static / brochure sites | one-shot CLI | **shipped** — `cmd/weblay-snapshot` |
| **CDN worker** (Cloudflare `HTMLRewriter`) | anyone on a modern CDN | deploy a worker | **example** — `examples/cloudflare-worker/` |
| **Framework middleware** (Next.js / Express) | apps with a server | a few lines | **example** — `examples/nextjs-middleware/` |
| **Build plugin** | fully static / JAMstack | bake at build, re-build on publish webhook | **example** — `examples/build-plugin/` |

The two Go modes (`weblay-edge`, `weblay-snapshot`) run the full `internal/ssr`
engine — every override, `data-weblay` anchors and `nth-of-type` structural
paths alike. The JS edge/build examples apply `data-weblay`-anchored edits (the
recommended, drift-proof path); see `examples/README.md`.

### The rewrite core (`internal/ssr`)

`ssr.Rewrite(originHTML, manifest)` parses the page, matches the exact selector
grammar the connector emits (`[data-weblay="…"]` anchors and `>`-joined
`nth-of-type` / id-anchored structural paths), and applies each override —
text, sanitized HTML, attributes, base inline styles, and a widest-first
`@media` stylesheet. It is the server-side twin of
`connector/src/runtime.ts applyManifest`: same "skip if the selector is
ambiguous" rule, same html-wins-over-text precedence, and it routes all content
through the shared `internal/sanitize` trust boundary. An ambiguous, missing, or
unparseable input never breaks the page — it serves the origin HTML unchanged.

### Shipped: the `weblay-edge` reverse proxy

Route traffic through `weblay-edge` and edits become crawler-visible with no
application changes:

```sh
weblay-edge \
  -listen :8080 \
  -origin https://origin.example.com \
  -server https://api.weblay.app \
  -site-key sk_live_xxx
```

For each request it proxies to the origin; for HTML responses it fetches the
page's manifest (cached, default 30s TTL — matching the manifest's own
`max-age`), applies it with `internal/ssr`, and streams the rewritten HTML.
Non-HTML responses pass through untouched. Rewritten pages carry an
`X-Weblay-SSR: 1` response header.

### Framework-middleware pattern (works today, no new code)

Where you own the render, fetch the manifest per request and read edited values
directly:

```js
// server-side, per page path
const res = await fetch(`${SERVER}/m/${SITE_KEY}/manifest.json?path=${encodeURIComponent(path)}`,
  { next: { revalidate: 30 } });          // cache; matches the manifest's own TTL
const elements = res.ok ? (await res.json()).elements : {};

// then read edited text/attrs by data-weblay name when rendering:
const title = elements['[data-weblay="hero-title"]']?.text ?? "Default title";
```

The manifest is already cache-friendly (`ETag` + `max-age=30` +
`stale-while-revalidate=300`), so the extra fetch is cheap and CDN-absorbable.

## Benefits beyond SEO

- **No flash.** Content is correct in the first byte, so the anti-flash guard and
  loader become unnecessary on edge/SSR-served pages.
- **Drift becomes robust.** Applying overrides with a server-side parser (and, at
  the build tier, injecting stable `data-weblay-id` anchors) is the same
  mechanism that makes selector identity drift-proof. **One boundary solves both
  SEO and drift** — see `production-readiness.md`.
- The connector script is then only needed for the **editor** (and optional
  progressive enhancement), not for content correctness.

## Trade-offs (be honest)

- **Reverse-proxy mode** puts Weblay in the critical request path — its
  availability becomes the site's. Mitigate with aggressive manifest caching
  (already in place) and a streaming rewrite; prefer framework-middleware or
  CDN-worker modes to distribute that risk.
- **Static build mode** has a publish → rebuild latency (trigger a rebuild via
  webhook on publish).
- **Pure static, no server, no CDN worker, no build hook** is the one case SEO
  can't be fully solved — there, client-side + `data-weblay` tagging is the
  ceiling, or use the snapshot export.

## Recommendation

1. **Shipped:** the `weblay-edge` reverse proxy — the zero-app-code on-ramp for
   any stack, built on the `internal/ssr` core.
2. **Next:** package the same core as **framework middleware** (Next.js /
   Express) and a **Cloudflare Worker** as the two lowest-friction,
   no-origin-change options; then a **build plugin** and **snapshot export** for
   fully static sites.
3. Keep the drop-in script tag as the frictionless on-ramp; customers who need
   SEO (and drift-proofing) **graduate** to an edge/build mode — without having
   to hand-tag anything.
