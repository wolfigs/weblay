// Published-content runtime: fetch the page manifest once, apply overrides,
// and never flash. This is the only code path visitors ever execute.

import type { ElementContent, InlayConfig, Manifest } from "./types";

const HIDE_STYLE_ID = "inlay-antifouc";
const REVEAL_TIMEOUT_MS = 400;

// Hide only elements that opted in via data-inlay until overrides land;
// structural-selector overrides apply too late to hide safely, so they may
// swap after paint — documented tradeoff, fixed by tagging elements.
export function guardAgainstFlash(): void {
  if (document.getElementById(HIDE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HIDE_STYLE_ID;
  style.textContent = "[data-inlay]{visibility:hidden !important}";
  document.head.appendChild(style);
  setTimeout(reveal, REVEAL_TIMEOUT_MS); // failsafe: never hide content for long
}

export function reveal(): void {
  document.getElementById(HIDE_STYLE_ID)?.remove();
}

export async function fetchManifest(cfg: InlayConfig): Promise<Manifest | null> {
  try {
    const url = `${cfg.server}/m/${cfg.siteKey}/manifest.json?path=${encodeURIComponent(cfg.path)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as Manifest;
  } catch {
    return null; // network failure: original markup is the fallback
  }
}

export function applyManifest(manifest: Manifest): void {
  for (const [selector, content] of Object.entries(manifest.elements)) {
    applyContent(selector, content);
  }
}

export function applyContent(selector: string, content: ElementContent): void {
  let el: Element | null = null;
  try {
    el = document.querySelector(selector);
  } catch {
    return; // stale/invalid selector: skip, never break the page
  }
  if (!el) return;

  if (typeof content.text === "string") {
    el.textContent = content.text;
  }
  if (content.attrs) {
    for (const [key, value] of Object.entries(content.attrs)) {
      if (isSafeAttr(key, value)) el.setAttribute(key, value);
    }
  }
}

// Attribute allowlist: enough for images, links, and accessibility, without
// letting stored content register event handlers or run javascript: URLs.
const ATTR_ALLOW = new Set(["src", "srcset", "alt", "title", "href", "target", "rel", "aria-label"]);

function isSafeAttr(key: string, value: string): boolean {
  const k = key.toLowerCase();
  if (!ATTR_ALLOW.has(k)) return false;
  if ((k === "href" || k === "src") && /^\s*javascript:/i.test(value)) return false;
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
