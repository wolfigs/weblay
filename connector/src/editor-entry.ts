// Lazily-loaded editor entry. This bundle (weblay-editor.js) is only fetched
// when an edit token is present, so visitors never download the editor UI.
//
// index.ts injects this script, then calls the global it installs below.

import { Editor } from "./editor";
import { EditAPI } from "./api";
import { startViewer, pendingViewId } from "./viewer";
import type { WeblayConfig } from "./types";

declare global {
  interface Window {
    __weblayStartEditor?: (cfg: WeblayConfig, token: string) => Promise<boolean>;
  }
}

// Returns true if the editor (or read-only viewer) started, false if the token
// was invalid/expired.
window.__weblayStartEditor = async (cfg: WeblayConfig, token: string): Promise<boolean> => {
  try {
    // A pending "view version" request takes over in read-only mode.
    if (pendingViewId() && (await startViewer(cfg, token))) return true;

    const session = await new EditAPI(cfg, token).session();
    const editor = new Editor(cfg, token, session.user.name || session.user.email);
    await editor.start();
    return true;
  } catch {
    return false;
  }
};
