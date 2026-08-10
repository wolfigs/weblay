// Weblay connector entry point.
//
//   <script src="https://your-weblay-server/weblay.js" data-site="ilk_…"></script>
//
// Visitors: fetch one manifest, apply overrides, done. Editors arriving via
// the dashboard's "Edit site" link (#weblay=TOKEN) get the visual editor.

import { Editor } from "./editor";
import {
  applyManifest,
  fetchManifest,
  guardAgainstFlash,
  normalizePath,
  onReady,
  reveal,
} from "./runtime";
import { EditAPI } from "./api";
import type { WeblayConfig } from "./types";

const TOKEN_KEY = "weblay:token";

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

  guardAgainstFlash();

  const manifestPromise = fetchManifest(cfg);

  onReady(async () => {
    const manifest = await manifestPromise;
    if (manifest) applyManifest(manifest);
    reveal();
    await maybeStartEditor(cfg);
  });
})();

async function maybeStartEditor(cfg: WeblayConfig): Promise<void> {
  // Token handoff: #weblay=TOKEN in the fragment (never sent to servers or
  // logged); moved into sessionStorage so reloads keep the session.
  const match = location.hash.match(/[#&]weblay=([a-f0-9]+)/);
  if (match) {
    sessionStorage.setItem(TOKEN_KEY, match[1]);
    history.replaceState(null, "", location.pathname + location.search);
  }
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return;

  try {
    const session = await new EditAPI(cfg, token).session();
    const editor = new Editor(cfg, token, session.user.name || session.user.email);
    await editor.start();
  } catch {
    sessionStorage.removeItem(TOKEN_KEY); // expired or revoked: back to visitor mode
  }
}
