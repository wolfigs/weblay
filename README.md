# Inlay

**Visual in-place editing for any website. One script tag. One binary. One database file.**

Inlay lets anyone edit a live website by clicking on it — no CMS migration, no rebuild, no framework lock-in. Content changes are saved as drafts, published as versioned revisions, and served from a single cacheable manifest per page.

*Prism builds it. Inlay lets anyone edit it.*

---

## How it works

```
┌─────────────┐   1 script tag    ┌──────────────┐
│  Your site   │ ────────────────▶ │ inlay.js      │  visitors: fetch one manifest,
│  (any stack) │                   │ (~8 kB)       │  apply content, done
└─────────────┘                   └──────┬───────┘
                                          │ editors: click text, type, publish
                                          ▼
                                   ┌──────────────┐
                                   │ inlay server  │  single Go binary
                                   │ SQLite/Postgres│ drafts → revisions → manifests
                                   └──────────────┘
```

- **Visitors** never pay for the editor: the connector fetches one ETag-cached JSON manifest per page and applies published content before paint.
- **Editors** open the page from the Inlay dashboard, click any text or image, edit in place, and hit Publish. Every publish is a versioned revision with one-click rollback.
- **Owners** self-host everything: `docker run` or a single binary, SQLite by default, Postgres when you grow.

## Quick start

### Run the server

```bash
docker run -p 8787:8787 -v inlay-data:/data wolfigs/inlay
# or, from a release binary:
inlay serve
```

Open `http://localhost:8787`, create the admin account, and add your site with its origin (e.g. `https://example.com`).

### Connect your site

Add the snippet from the dashboard to every page, ideally in `<head>`:

```html
<script src="https://your-inlay-server/inlay.js" data-site="ilk_…"></script>
```

Optionally tag the elements you care about — named elements are rename-proof and flash-free:

```html
<h1 data-inlay="hero-title">Welcome</h1>
<img data-inlay="hero-image" src="/hero.jpg" alt="">
```

Untagged text elements and images are editable too, addressed by a stable structural selector.

### Edit

In the dashboard, open your site → **Open editor**. The page opens with the visual editor: click text to edit, click images to replace, **Publish** when ready. Changes go live within seconds (manifests cache for 30 s).

## Configuration

| Flag / env | Default | Meaning |
|---|---|---|
| `-addr` / `INLAY_ADDR` | `:8787` | Listen address |
| `-data` / `INLAY_DATA` | `./inlay-data` | SQLite DB, uploads, instance secret |
| `-dsn` / `INLAY_DSN` | *(empty)* | Postgres DSN; empty = SQLite |
| `-base` / `INLAY_BASE_URL` | *(empty)* | Public URL, used for upload links and secure cookies |

Put the server behind TLS (Caddy, nginx, or your platform) and set `INLAY_BASE_URL=https://…` in production.

## Design decisions

- **One manifest per page.** No per-element requests; the hot path is a single cacheable GET a CDN can absorb.
- **Token handoff, not third-party cookies.** The dashboard opens your site with a short-lived token in the URL fragment. Fragments are never sent to servers; the token lives in `sessionStorage` and expires in 4 hours.
- **Plain-text editing, attribute allowlist.** Editors can change text, image sources, links, and alt text — not inject HTML or event handlers. Rich text is on the roadmap behind server-side sanitization.
- **Revisions are append-only.** Publish creates a new version; restore re-publishes an old one as a new version. History is never rewritten.

## Development

```bash
make connector   # build inlay.js (needs Node 22)
make server      # build the binary
make test        # Go tests + connector typecheck
```

Repository layout:

```
cmd/inlay/        CLI entry point
internal/         config, store (SQLite/Postgres), auth, HTTP API
connector/        TypeScript connector + visual editor
web/admin/        embedded dashboard SPA
web/connector/    built connector, embedded into the binary
demo/             static demo site
```

## License

Apache-2.0 © Wolfigs
