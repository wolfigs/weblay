// Instant loading indicator.
//
// The whole point is zero latency: the loader is configured entirely from the
// script tag's data-* attributes (already in the HTML) and shown synchronously
// as the connector executes — before any manifest fetch. Fetching the config
// from the server would defeat the purpose, so it never does.
//
// Modes:
//   overlay   full-screen cover with a spinner (optional logo + text)
//   bar       thin indeterminate progress bar at the top
//   skeleton  shimmer placeholders over [data-weblay] elements
//   custom    the developer's own element (data-loader-el) — Weblay just hides
//             it when content is ready
//   none      no loader (only the anti-flash guard runs)

export interface LoaderConfig {
  mode: "none" | "overlay" | "bar" | "skeleton";
  bg: string;
  accent: string;
  text: string;
  logo: string;
  customEl: string;
}

const HOST_ID = "weblay-loader";
const SKELETON_ID = "weblay-loader-skeleton";
const MODES = ["none", "overlay", "bar", "skeleton"];

export function readLoaderConfig(script: HTMLScriptElement | null): LoaderConfig {
  const g = (n: string, d = ""): string => (script?.getAttribute(n) ?? "").trim() || d;
  const mode = g("data-loader", "none");
  return {
    mode: (MODES.includes(mode) ? mode : "none") as LoaderConfig["mode"],
    bg: sanitizeColor(g("data-loader-bg", "#ffffff"), "#ffffff"),
    accent: sanitizeColor(g("data-loader-accent", "#6366f1"), "#6366f1"),
    text: g("data-loader-text"),
    logo: g("data-loader-logo"),
    customEl: g("data-loader-el"),
  };
}

// Show the loader synchronously. Safe to call before <body> exists (head-loaded
// script): it falls back to <html> as the mount point.
export function showLoader(cfg: LoaderConfig): void {
  if (cfg.customEl) return;                 // developer's element is already visible
  if (cfg.mode === "none") return;
  if (document.getElementById(HOST_ID) || document.getElementById(SKELETON_ID)) return;

  if (cfg.mode === "skeleton") {
    const style = document.createElement("style");
    style.id = SKELETON_ID;
    style.textContent = skeletonCSS();
    (document.head || document.documentElement).appendChild(style);
    return;
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("data-weblay-ui", "");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = cfg.mode === "overlay" ? overlayHTML(cfg) : barHTML(cfg);
  (document.body || document.documentElement).appendChild(host);
}

// Hide/remove the loader once content is ready, with a short fade.
export function hideLoader(cfg: LoaderConfig): void {
  if (cfg.customEl) {
    const el = document.querySelector<HTMLElement>(cfg.customEl);
    if (el) {
      el.style.transition = "opacity .3s ease";
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      window.setTimeout(() => { el.style.display = "none"; }, 320);
    }
    return;
  }
  document.getElementById(SKELETON_ID)?.remove();
  const host = document.getElementById(HOST_ID);
  if (!host) return;
  const inner = host.shadowRoot?.firstElementChild as HTMLElement | null;
  if (inner) inner.classList.add("weblay-done");
  window.setTimeout(() => host.remove(), 340);
}

function overlayHTML(cfg: LoaderConfig): string {
  return `
    <style>
      :host { all: initial; }
      .ov {
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
        background: ${cfg.bg};
        transition: opacity .32s ease; opacity: 1;
        font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .ov.weblay-done { opacity: 0; pointer-events: none; }
      .logo { max-width: 160px; max-height: 64px; object-fit: contain; }
      .spin {
        width: 34px; height: 34px; border-radius: 50%;
        border: 3px solid ${hexA(cfg.accent, 0.22)}; border-top-color: ${cfg.accent};
        animation: weblay-spin .7s linear infinite;
      }
      .txt { color: ${hexA(cfg.accent, 0.9)}; font-weight: 500; letter-spacing: .01em; }
      @keyframes weblay-spin { to { transform: rotate(360deg); } }
    </style>
    <div class="ov">
      ${cfg.logo ? `<img class="logo" src="${escapeAttr(cfg.logo)}" alt="" />` : ""}
      <div class="spin"></div>
      ${cfg.text ? `<div class="txt">${escapeText(cfg.text)}</div>` : ""}
    </div>`;
}

function barHTML(cfg: LoaderConfig): string {
  return `
    <style>
      :host { all: initial; }
      .bar {
        position: fixed; top: 0; left: 0; right: 0; height: 3px; z-index: 2147483647;
        background: ${hexA(cfg.accent, 0.15)}; overflow: hidden;
        transition: opacity .3s ease; opacity: 1;
      }
      .bar.weblay-done { opacity: 0; }
      .bar::before {
        content: ""; position: absolute; inset: 0 auto 0 0; width: 40%;
        background: ${cfg.accent};
        animation: weblay-slide 1.1s cubic-bezier(.4,0,.2,1) infinite;
      }
      @keyframes weblay-slide {
        0%   { left: -40%; width: 40%; }
        50%  { left: 30%;  width: 55%; }
        100% { left: 100%; width: 40%; }
      }
    </style>
    <div class="bar"></div>`;
}

// Shimmer over opted-in elements; kept CSS-only so it applies the moment those
// elements render, even if they don't exist yet when this style is injected.
//
// The element itself is forced visible (overriding the anti-flash guard's
// visibility:hidden — otherwise the shimmer would be hidden too); its text is
// made transparent and its child elements hidden, so only the shimmer shows.
function skeletonCSS(): string {
  return `
    [data-weblay], [data-weblay-skeleton] {
      visibility: visible !important;
      color: transparent !important;
      background-color: rgba(0,0,0,.08) !important;
      background-image: linear-gradient(100deg, transparent 20%, rgba(255,255,255,.6) 50%, transparent 80%) !important;
      background-repeat: no-repeat !important;
      background-size: 200% 100% !important;
      border-radius: 6px !important;
      animation: weblay-shimmer 1.15s ease-in-out infinite !important;
    }
    [data-weblay] *, [data-weblay-skeleton] * { visibility: hidden !important; }
    @keyframes weblay-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`;
}

// --- small helpers (no deps, safe for untrusted-ish attribute values) ---

function sanitizeColor(v: string, fallback: string): string {
  return /^#[0-9a-fA-F]{3,8}$|^rgb|^hsl|^[a-zA-Z]+$/.test(v) && !/[<>(){};]/.test(v.replace(/^rgb\(|^hsl\(|\)$/g, "")) ? v : fallback;
}

function hexA(color: string, alpha: number): string {
  const m = color.match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function escapeAttr(s: string): string {
  return s.replace(/["'<>]/g, (c) => `&#${c.charCodeAt(0)};`);
}

function escapeText(s: string): string {
  return s.replace(/[<>&]/g, (c) => `&#${c.charCodeAt(0)};`);
}
