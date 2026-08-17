# Production Readiness — Gaps & Roadmap

A candid map of what stands between Weblay's current state and a production-grade
product. Grounded in the actual architecture (script-tag connector + dashboard,
override model, remote DB), not a generic checklist.

Already addressed: **loading-time delay** (instant, tag-configured loaders +
manifest fetch timeout), and **multi-screen responsiveness** (true-viewport
iframe device preview + per-breakpoint style buckets).

---

## Editing limitations (feature completeness)

### Transient / hidden elements
Carousels, tabs, accordions, modals, off-canvas menus, and "load more" content
can't be edited. Selection is driven by `getBoundingClientRect` + hover, so
anything with `display:none`, zero size, or off-screen **can't be clicked or
overlaid**.

- **Fix direction:** a **layers / DOM-tree panel** to select any element
  regardless of visibility, plus a "force-show hidden" toggle in edit mode.

### Hover / focus states
Two distinct problems:
1. *Selecting* a hover-only element (dropdown, tooltip) is impossible — it
   vanishes when the pointer moves to the toolbar. Needs a **"pin state"** control.
2. *Styling* `:hover` / `:focus` / `:active` isn't supported at all — only the
   base state is editable. This mirrors the breakpoint media buckets: add
   **state buckets** that emit `selector:hover { … }`.

### Structural editing
Only existing elements can be edited. No add / remove / duplicate / reorder
(e.g. "add a 4th product card"). A deliberate scope decision today, but the
most commonly requested capability.

---

## Tier 1 — will silently break in production

- **Selector drift.** The override model hinges on `nth-of-type` CSS paths
  staying stable across the customer's deploys. If they change markup, overrides
  **silently break or mis-apply** — with no detection, no "orphaned override"
  warning, and no GC. This is the existential risk of the override approach.
  Needs: drift detection, a dashboard "N overrides no longer match" report, and
  re-binding.
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
- **Concurrent editing = last-write-wins.** Two editors on the same element
  silently clobber each other. No locking, presence, or conflict detection.

## Tier 1 — security

- **SVG uploads served same-origin.** `image/svg+xml` is allowed and served from
  `/a/…`. SVGs can carry `<script>` → **stored XSS on the asset origin**.
  Sanitize SVG, or serve assets from a separate sandboxed origin with
  `Content-Disposition`.
- **Rate limiting is in-memory and only on login/setup.** Per-instance (useless
  behind a load balancer), and there's **nothing on upload or draft-save** →
  abuse / DoS + no per-site storage quota.
- **Account security gaps.** No password reset, no session-revocation UI, no
  email verification, no 2FA. Verify **CSRF protection** on the cookie-authed
  dashboard mutations, and that the edit token (URL-fragment → `sessionStorage`)
  can't leak via history / extensions.

## Tier 2 — completeness & operations

- **Publish → cache staleness.** Manifests are cached
  `max-age=30, stale-while-revalidate=300`; a just-published change can be stale
  for ~30s+ with no purge. Add cache invalidation or versioned manifest URLs.
- **Approval workflow + preview links.** Any editor can publish straight to
  production with no review, and there's no way to share an unpublished draft
  with a stakeholder without granting edit access.
- **Multi-instance readiness.** In-memory rate limiter, local uploads, and no
  shared cache all assume a single node.
- **Observability.** Structured logs only — no metrics (request rate, manifest
  latency, error rates), tracing, or alerting. Plus backups / PITR and a
  **connector version-rollout strategy** (ship a `weblay.js` update without
  breaking editors mid-session).

## Tier 3 — engineering hygiene

- **The TypeScript connector has zero tests.** The sanitizer, `selectorFor`, and
  editor logic are the riskiest code and are untested on the JS side. Add unit
  tests (especially selector stability) + a Playwright E2E for the
  edit → publish loop.
- Versioned migrations (schema is idempotent `IF NOT EXISTS` — fine until a
  breaking change), CI, and — if this becomes SaaS — orgs / teams, billing,
  per-plan quotas, and i18n / locale-aware content.

---

## Suggested priority order

1. **Selector-drift detection** — protects the core model from silent breakage.
2. **Object storage for assets** — unblocks multi-instance + durability.
3. **SVG / asset-serving XSS + real rate limiting** — closes the obvious holes.
4. **Layers / tree panel** — unlocks hidden-element editing *and* is the
   foundation for hover-state selection (two gaps, one feature).
5. ~~**SEO / SSR story**~~ — **done**: `internal/ssr` core + `weblay-edge`
   reverse proxy make content edits crawler-visible. Follow-ups (framework
   middleware, CDN worker, snapshot export) are additive delivery modes.
