/**
 * Weblay Cloudflare Worker — makes edits SEO-correct at the edge with no origin
 * change. Route your zone through this worker: it fetches the page from the
 * origin and the page's published Weblay manifest, then rewrites the HTML with
 * Cloudflare's streaming HTMLRewriter so crawlers get the edited content.
 *
 * Configure via environment variables (wrangler.toml [vars] / secrets):
 *   WEBLAY_SERVER   e.g. https://api.weblay.app
 *   WEBLAY_SITE_KEY e.g. sk_live_xxx
 *
 * Coverage: this applies edits anchored with `data-weblay` names — the
 * recommended, drift-proof anchors — because HTMLRewriter selectors do not
 * support `nth-of-type` structural paths. Tag your key elements with
 * `data-weblay` (the connector does this on "harden") for full edge coverage;
 * everything else still resolves client-side via the connector as a fallback.
 */

export default {
  async fetch(request, env, ctx) {
    const response = await fetch(request);

    const ct = response.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return response;

    const url = new URL(request.url);
    const manifest = await getManifest(env, url.pathname, ctx);
    if (!manifest || !manifest.elements) return response;

    const rewriter = new HTMLRewriter();
    let applied = 0;
    for (const [selector, content] of Object.entries(manifest.elements)) {
      const name = weblayName(selector);
      if (!name) continue; // only data-weblay anchors are edge-applicable
      rewriter.on(`[data-weblay="${cssEscape(name)}"]`, new ElementEditor(content));
      applied++;
    }
    if (applied === 0) return response;

    const out = rewriter.transform(response);
    const headers = new Headers(out.headers);
    headers.set("x-weblay-ssr", "1");
    return new Response(out.body, { status: out.status, headers });
  },
};

// Per-element handler that applies one override's text/html/attrs.
class ElementEditor {
  constructor(content) {
    this.content = content;
  }
  element(el) {
    const c = this.content;
    if (typeof c.html === "string") el.setInnerContent(c.html, { html: true });
    else if (typeof c.text === "string") el.setInnerContent(c.text);
    if (c.attrs) {
      for (const [k, v] of Object.entries(c.attrs)) {
        if (!isSafeAttr(k, v)) continue;
        if (v === "") el.removeAttribute(k);
        else el.setAttribute(k, v);
      }
    }
    // Base inline styles: merge onto any existing style attribute.
    if (c.style) {
      const decls = Object.entries(c.style)
        .filter(([, val]) => val !== "")
        .map(([prop, val]) => `${prop}:${val}`)
        .join(";");
      if (decls) {
        const existing = el.getAttribute("style");
        el.setAttribute("style", existing ? `${existing};${decls}` : decls);
      }
    }
  }
}

async function getManifest(env, path, ctx) {
  const key = `${env.WEBLAY_SITE_KEY}:${path}`;
  const cache = caches.default;
  const cacheURL = new URL(`https://weblay-manifest.internal/${encodeURIComponent(key)}`);
  const cached = await cache.match(cacheURL);
  if (cached) return cached.json();

  const u = `${env.WEBLAY_SERVER}/m/${encodeURIComponent(env.WEBLAY_SITE_KEY)}/manifest.json?path=${encodeURIComponent(path)}`;
  const res = await fetch(u, { cf: { cacheTtl: 30 } });
  if (!res.ok) return null;
  const body = await res.text();
  // Cache the manifest at the edge for its TTL to avoid a fetch per request.
  ctx.waitUntil(
    cache.put(cacheURL, new Response(body, { headers: { "cache-control": "max-age=30" } })),
  );
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

const ATTR_ALLOW = new Set(["src", "srcset", "alt", "title", "href", "target", "rel", "aria-label", "placeholder"]);
function isSafeAttr(key, value) {
  const k = key.toLowerCase();
  if (!ATTR_ALLOW.has(k)) return false;
  if ((k === "href" || k === "src") && /^\s*(javascript|data|vbscript):/i.test(value)) return false;
  return true;
}

// `[data-weblay="NAME"]` -> NAME (CSS-unescaped), else null.
function weblayName(selector) {
  const m = selector.match(/^\[data-weblay="(.*)"\]$/);
  return m ? m[1].replace(/\\(.)/g, "$1") : null;
}

function cssEscape(s) {
  return s.replace(/["\\]/g, "\\$&");
}
