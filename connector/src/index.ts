// Weblay connector entry point.
//
//   <script src="https://your-weblay-server/weblay.js" data-site="ilk_…"></script>
//
// Visitors: fetch one manifest, apply overrides, done. Editors arriving via
// the dashboard's "Edit site" link (#weblay=TOKEN) get the visual editor.

import {
  applyManifest,
  fetchManifest,
  guardAgainstFlash,
  normalizePath,
  onReady,
  reveal,
} from "./runtime";
import { readLoaderConfig, showLoader, hideLoader } from "./loader";
import { mountStage, isStage } from "./frame";
import type { WeblayConfig } from "./types";

const TOKEN_KEY = "weblay:token";
const EDITOR_SCRIPT = "/weblay-editor.js";

(() => {
  const script = document.currentScript as HTMLScriptElement | null;
  const siteKey = script?.getAttribute("data-site") ?? "";
  if (!siteKey) {
    console.warn("[weblay] missing data-site attribute on script tag");
    return;
  }
  const server =
    script?.getAttribute("data-server")?.replace(/\/$/, "") ||
    new URL(script!.src).origin;

  const cfg: WeblayConfig = {
    siteKey,
    server,
    path: normalizePath(location.pathname),
  };

  // Show the developer-configured loader immediately — synchronously, from the
  // script tag alone, so it never waits on a network round-trip.
  const loader = readLoaderConfig(script);
  guardAgainstFlash();
  showLoader(loader);

  const manifestPromise = fetchManifest(cfg);

  const done = (): void => { reveal(); hideLoader(loader); };

  onReady(async () => {
    const token = takeToken();

    // Top window with an edit token: host the page (and its editor) inside a
    // real-width iframe so device previews render like actual devices. The
    // editor runs in that iframe, not here.
    if (token && !isStage()) {
      done();
      mountStage();
      return;
    }

    const manifest = await manifestPromise;
    if (manifest) applyManifest(manifest, cfg);
    done();

    // Visitors have no token and stop here — the editor bundle is never
    // fetched. The stage iframe (or a same-window fallback) starts the editor.
    if (token) await startEditor(cfg, token);
  });
})();

// Move #weblay=TOKEN (and an optional &rebind=SELECTOR) from the fragment (never
// sent to servers or logged) into sessionStorage, then return the active token.
// The stage iframe reads them from sessionStorage since it shares the origin.
function takeToken(): string | null {
  const match = location.hash.match(/[#&]weblay=([a-f0-9]+)/);
  const rebind = location.hash.match(/[#&]rebind=([^&]+)/);
  if (match) {
    sessionStorage.setItem(TOKEN_KEY, match[1]);
    if (rebind) sessionStorage.setItem("weblay:rebind", decodeURIComponent(rebind[1]));
    history.replaceState(null, "", location.pathname + location.search);
  }
  return sessionStorage.getItem(TOKEN_KEY);
}

async function startEditor(cfg: WeblayConfig, token: string): Promise<void> {
  try {
    await loadEditorBundle(cfg.server);
    const ok = await window.__weblayStartEditor?.(cfg, token);
    if (!ok) sessionStorage.removeItem(TOKEN_KEY); // expired or revoked
  } catch {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

// Inject the editor bundle once, resolving when it has installed its global.
let editorLoad: Promise<void> | null = null;
function loadEditorBundle(server: string): Promise<void> {
  if (window.__weblayStartEditor) return Promise.resolve();
  if (editorLoad) return editorLoad;
  editorLoad = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = server + EDITOR_SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("failed to load editor"));
    document.head.appendChild(s);
  });
  return editorLoad;
}

declare global {
  interface Window {
    __weblayStartEditor?: (cfg: WeblayConfig, token: string) => Promise<boolean>;
  }
}
