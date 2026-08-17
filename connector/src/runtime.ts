// Published-content runtime: fetch the page manifest once, apply overrides,
// and never flash. This is the only code path visitors ever execute.

import type { ElementContent, WeblayConfig, Manifest } from "./types";
import { sanitizeHTML, isSafeCSSProp, isSafeCSSValue } from "./sanitize";
import { parseThreshold } from "./breakpoints";
import { verifyAndReport } from "./telemetry";

const MEDIA_STYLE_ID = "weblay-media";

const HIDE_STYLE_ID = "weblay-antifouc";
// Backstop only: content is normally revealed as soon as the manifest resolves
// (which always happens, since fetchManifest catches and times out). This just
// protects against a hung DOMContentLoaded so content is never stuck hidden.
const REVEAL_TIMEOUT_MS = 6000;
// Manifest fetch cap: with a remote DB a slow query shouldn't hang the page.
const FETCH_TIMEOUT_MS = 5000;

// Hide only elements that opted in via data-weblay until overrides land;
// structural-selector overrides apply too late to hide safely, so they may
// swap after paint — documented tradeoff, fixed by tagging elements.
export function guardAgainstFlash(): void {
  if (document.getElementById(HIDE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HIDE_STYLE_ID;
  style.textContent = "[data-weblay]{visibility:hidden !important}";
  (document.head || document.documentElement).appendChild(style);
  setTimeout(reveal, REVEAL_TIMEOUT_MS); // failsafe: never hide content forever
}

export function reveal(): void {
  document.getElementById(HIDE_STYLE_ID)?.remove();
}

export async function fetchManifest(cfg: WeblayConfig): Promise<Manifest | null> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : undefined;
  try {
    const url = `${cfg.server}/m/${cfg.siteKey}/manifest.json?path=${encodeURIComponent(cfg.path)}`;
    const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    if (!res.ok) return null;
    return (await res.json()) as Manifest;
  } catch {
    return null; // network failure/timeout: original markup is the fallback
  } finally {
    clearTimeout(timer);
  }
}

export function applyManifest(manifest: Manifest, cfg?: WeblayConfig): void {
  for (const [selector, content] of Object.entries(manifest.elements)) {
    applyContent(selector, content);
  }
  applyResponsive(manifest.elements);
  // Verify what actually landed and report coverage (detection channel #3).
  if (cfg) verifyAndReport(cfg, cfg.path, Object.keys(manifest.elements));
}

// Build one stylesheet of @media rules from every element's breakpoint buckets.
// Buckets are keyed by their px threshold; base styles are applied inline (all
// screens), so these rules carry !important to beat the inline base.
//
// Rules are emitted widest-first so that on small screens, where several
// thresholds match, the narrowest one wins by source order.
export function applyResponsive(elements: Record<string, ElementContent>): void {
  // Gather every distinct threshold across all elements, widest first.
  const thresholds = new Set<number>();
  for (const content of Object.values(elements)) {
    for (const key of Object.keys(content.media ?? {})) {
      const t = parseThreshold(key);
      if (t !== null) thresholds.add(t);
    }
  }

  let css = "";
  for (const t of [...thresholds].sort((a, b) => b - a)) {
    let block = "";
    for (const [selector, content] of Object.entries(elements)) {
      const styles = content.media?.[String(t)];
      if (!styles) continue;
      const decls = responsiveDecls(styles);
      if (decls) block += `${selector}{${decls}}`;
    }
    if (block) css += `@media (max-width:${t}px){${block}}`;
  }
  injectStyleSheet(MEDIA_STYLE_ID, css);
}

function responsiveDecls(styles: Record<string, string>): string {
  const out: string[] = [];
  for (const [prop, value] of Object.entries(styles)) {
    if (!isSafeCSSProp(prop)) continue;
    // Empty value clears the base at this breakpoint (revert to site CSS).
    if (value === "") { out.push(`${prop}:unset!important`); continue; }
    if (isSafeCSSValue(value)) out.push(`${prop}:${value}!important`);
  }
  return out.join(";");
}

function injectStyleSheet(id: string, css: string): void {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!css) { el?.remove(); return; }
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export function applyContent(selector: string, content: ElementContent): void {
  let els: NodeListOf<Element>;
  try {
    els = document.querySelectorAll(selector);
  } catch {
    return; // stale/invalid selector: skip, never break the page
  }
  // Fail-safe: a selector matching multiple elements is ambiguous — applying it
  // would edit the wrong element(s), so skip. The telemetry pass reports it.
  if (els.length !== 1) return;
  const el = els[0];

  // html wins over text; both are last-writer-wins on the element's contents.
  // html is re-sanitized here even though it was sanitized on save — the
  // manifest is untrusted from the runtime's perspective (defense in depth).
  if (typeof content.html === "string") {
    el.innerHTML = sanitizeHTML(content.html);
  } else if (typeof content.text === "string") {
    el.textContent = content.text;
  }
  if (content.attrs) {
    for (const [key, value] of Object.entries(content.attrs)) {
      if (value === "") {
        el.removeAttribute(key); // empty string = remove (e.g. clearing srcset)
      } else if (isSafeAttr(key, value)) {
        el.setAttribute(key, value);
      }
    }
  }
  if (content.style && el instanceof HTMLElement) {
    for (const [prop, value] of Object.entries(content.style)) {
      if (isSafeCSSProp(prop) && isSafeCSSValue(value)) {
        el.style.setProperty(prop, value);
      }
    }
  }
}

// Attribute allowlist: enough for images, links, accessibility, and form hints,
// without letting stored content register event handlers or run javascript: URLs.
const ATTR_ALLOW = new Set([
  "src", "srcset", "alt", "title", "href", "target", "rel",
  "aria-label", "placeholder",
]);

function isSafeAttr(key: string, value: string): boolean {
  const k = key.toLowerCase();
  if (!ATTR_ALLOW.has(k)) return false;
  if ((k === "href" || k === "src") && /^\s*(javascript|data|vbscript):/i.test(value)) return false;
  return true;
}

export function normalizePath(p: string): string {
  if (!p) return "/";
  const cut = p.split(/[?#]/)[0];
  let out = cut.startsWith("/") ? cut : "/" + cut;
  if (out.length > 1) out = out.replace(/\/+$/, "") || "/";
  return out;
}

export function onReady(fn: () => void): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } else {
    fn();
  }
}
