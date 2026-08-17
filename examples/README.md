# Weblay delivery-mode examples

Make Weblay edits SEO-correct — present in the server's first byte, visible to
crawlers and social-preview bots that never run JavaScript. Each mode applies the
published manifest at a different point in the serving path. All share one idea
(the `internal/ssr` rewrite core); pick the one that fits your stack.

| Mode | Where it runs | Coverage | Effort |
|---|---|---|---|
| **`weblay-edge`** reverse proxy (`cmd/weblay-edge`) | in front of any origin | full (data-weblay + structural paths) | route traffic through it |
| **Cloudflare Worker** (`cloudflare-worker/`) | Cloudflare edge | `data-weblay` anchors (HTMLRewriter) | deploy a worker |
| **Next.js helper** (`nextjs-middleware/`) | your Next server | whatever you wire in render | a few lines |
| **Snapshot export** (`cmd/weblay-snapshot`) | one-shot / build step | full (data-weblay + structural paths) | run the CLI |
| **Build plugin** (`build-plugin/`) | static build post-step | `data-weblay` text edits | add a build step |

The Go modes (`weblay-edge`, `weblay-snapshot`) use the full `internal/ssr`
engine, so they apply every override — `data-weblay` anchors **and**
`nth-of-type` structural paths — including sanitized HTML, attributes, base
styles, and the responsive `@media` stylesheet. The JS edge/build modes apply
`data-weblay`-anchored edits (HTMLRewriter and simple rewriting don't do
`nth-of-type`); tag key elements with `data-weblay` — the connector does this on
**Harden** — for full coverage there, with the client-side connector as a
fallback for the rest.

## Quick starts

**Reverse proxy (zero app code):**
```sh
weblay-edge -listen :8080 -origin https://origin.example.com \
  -server https://api.weblay.app -site-key sk_live_xxx
```

**Snapshot a static site:**
```sh
weblay-snapshot -origin https://example.com -server https://api.weblay.app \
  -site-key sk_live_xxx -paths / /about /pricing -out ./snapshot
```

**Cloudflare Worker:** edit `cloudflare-worker/wrangler.toml`, then `wrangler deploy`.

**Next.js:** copy `nextjs-middleware/weblay.ts` into your project and read edited
values while rendering (see `page-example.tsx`).

**Build plugin:** `node build-plugin/weblay-postbuild.mjs --dir ./out --server … --site-key …`
