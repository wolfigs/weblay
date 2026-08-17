# Production Readiness — Gaps & Roadmap

A candid map of what stands between Weblay's current state and a production-grade
product. Grounded in the actual architecture (script-tag connector + dashboard,
override model, remote DB), not a generic checklist.

Already addressed: **loading-time delay** (instant, tag-configured loaders +
manifest fetch timeout), and **multi-screen responsiveness** (true-viewport
iframe device preview + per-breakpoint style buckets).

**Shipped since (2026-08):** selector-drift detection; SEO/SSR (edge proxy,
snapshot export, CDN-worker/Next.js/build-plugin examples); concurrent-edit
conflict detection; SVG-upload sanitization; per-site rate limits + storage
quota; account security (password reset, session revocation, email verification,
TOTP 2FA, CSRF); versioned manifest URLs; approval workflow + preview links;
Prometheus `/metrics`; versioned migrations + CI; connector unit tests +
Playwright scaffold; and the **Wolfigs account platform** (super-admin/roles,
admin panel with platform-wide website oversight). Remaining gaps below.

---

## Editing limitations (feature completeness)

### Transient / hidden elements
Carousels, tabs, accordions, modals, off-canvas menus, and "load more" content
can't be edited. Selection is driven by `getBoundingClientRect` + hover, so
anything with `display:none`, zero size, or off-screen **can't be clicked or
overlaid**.

- **Fix direction:** a **layers / DOM-tree panel** to select any element
  regardless of visibility, plus a "force-show hidden" toggle in edit mode.

### Hover / focus states — OPEN
Two distinct problems:
1. *Selecting* a hover-only element (dropdown, tooltip) is impossible — it
   vanishes when the pointer moves to the toolbar. Needs a **"pin state"** control.
2. *Styling* `:hover` / `:focus` / `:active` isn't supported at all — only the
   base state is editable. This mirrors the breakpoint media buckets: add
   **state buckets** that emit `selector:hover { … }`.
(The layers / DOM-tree panel for selecting hidden elements — the sibling gap —
already shipped in `connector/src/layers.ts`.)

### Structural editing
Only existing elements can be edited. No add / remove / duplicate / reorder
(e.g. "add a 4th product card"). A deliberate scope decision today, but the
most commonly requested capability.

---

## Tier 1 — will silently break in production

- ~~**Selector drift.**~~ **DONE** — multi-signal descriptors + server-side
  re-resolution, six-category classification, three detection channels, health
  ladder, dashboard report, and re-bind/harden recovery.
- **Assets on local disk.** Uploads are stored at a local filesystem
  `disk_path`. Now that the DB is remote, this is the glaring inconsistency: it
  **breaks with 2+ instances** (assets live on one node), isn't durable, has
  **no orphan cleanup** (storage leak), and offers no CDN / responsive-image
  generation. Move to S3-compatible object storage + CDN.
- **SEO — addressed (edge/SSR mode shipped).** In pure script-tag mode, edits
  are swapped **client-side**, so crawlers and social-preview bots see the
  *un-edited* original text. This is now solved at the serving boundary: the
  `internal/ssr` core applies the manifest to the origin HTML server-side, and
  the `weblay-edge` reverse proxy (`cmd/weblay-edge`) delivers it with zero app
  code — crawlers get the edited content in the first byte. Remaining work is
  breadth, not correctness: package the same core as framework middleware and a
  CDN worker (see `seo.md`). Pure static with no server/CDN/build hook is still
  the one case that needs the snapshot export.
- ~~**Concurrent editing = last-write-wins.**~~ **DONE** — per-element `rev`
  optimistic concurrency: a stale save gets HTTP 409 and the connector reloads
  the winning edit instead of clobbering it. (Live presence/co-editing is still
  future work, but silent data loss is fixed.)

## Tier 1 — security

- ~~**SVG uploads served same-origin.**~~ **DONE** — uploads run through
  `sanitize.SVG` (rejects `<script>`/`on*`/`javascript:`/`foreignObject`/XXE)
  and are served under a `sandbox` CSP.
- ~~**Rate limiting is in-memory and only on login/setup.**~~ **DONE (single-node)** —
  per-site draft-save + upload ceilings and a DB-backed per-site storage quota.
  *Still per-instance* — a shared/distributed limiter is part of multi-instance
  readiness below.
- ~~**Account security gaps.**~~ **DONE** — password reset + email verification
  (pluggable Mailer), active-session listing + revocation, TOTP 2FA with
  recovery codes, and CSRF double-submit on all cookie-authed mutations.

## Tier 2 — completeness & operations

- ~~**Publish → cache staleness.**~~ **DONE** — versioned immutable manifest
  URLs (`?v=N`) + `X-Weblay-Version`; a stale version is served `no-cache` so
  clients self-correct.
- ~~**Approval workflow + preview links.**~~ **DONE** — editors submit for
  review; owners/admins approve/reject+publish; signed, expiring preview links
  serve a draft manifest without granting edit access.
- **Multi-instance readiness — PARTIAL / OPEN.** DB-backed quota and versioned
  manifests are shared-safe, but the **rate limiter is still in-memory** and
  **uploads are local disk** (see object storage above). A shared cache/limiter
  and object storage are what remain for true multi-node.
- **Observability — PARTIAL.** Prometheus `/metrics` (request rate, latency
  histogram, error rates by route) shipped. **Still open:** distributed
  tracing, alerting, backups / PITR, and a **connector version-rollout
  strategy** (ship a `weblay.js` update without breaking editors mid-session).

## Tier 3 — engineering hygiene

- ~~**The TypeScript connector has zero tests.**~~ **DONE (started)** — a
  dependency-free esbuild test harness covers the API client (optimistic
  concurrency), `parseThreshold`, and `normalizePath`; a Playwright E2E scaffold
  exists (`e2e/`). *Still worth adding:* DOM-level `selectorFor`/sanitizer specs
  and running the E2E in CI.
- ~~Versioned migrations~~ **DONE** (`schema_migrations` runner) and CI updated.
  **Still open — if this becomes SaaS:** orgs / teams, billing, per-plan quotas,
  and i18n / locale-aware content.

---

## Remaining work (priority order)

Most of the original list is done (see the "Shipped since" note at the top).
What's genuinely left:

1. **Object storage for assets (S3 + CDN)** — the last Tier-1 gap. Assets are on
   local disk (`disk_path`), so uploads break with 2+ instances and aren't
   durable. This is the main blocker for multi-instance.
2. **Multi-instance readiness** — follows from #1, plus a shared/distributed
   rate limiter (currently in-memory) and shared cache.
3. **Observability remainder** — tracing, alerting, backups / PITR, and a
   connector version-rollout strategy. (Metrics already ship.)
4. **Editing feature-completeness** — hover/focus **state buckets** + a "pin
   state" control, and **structural editing** (add / remove / duplicate /
   reorder). The layers panel already ships.
5. **SaaS layer (if pursued)** — orgs / teams, billing, per-plan quotas, i18n.

Done and no longer on the list: selector drift, SEO/SSR (+ delivery modes),
concurrent-edit safety, SVG XSS, rate limiting + quota, cache staleness,
approval + preview links, account security (reset/revocation/verify/2FA/CSRF),
metrics, versioned migrations + CI, connector tests, and the Wolfigs account
platform (roles, admin panel, platform-wide site oversight).
