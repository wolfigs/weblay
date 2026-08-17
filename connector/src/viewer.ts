// Read-only version viewer. When an editor picks "View" on a past version, the
// stage reloads with weblay:view=<revisionId> in sessionStorage. This module
// fetches that revision, renders its manifest onto the page WITHOUT any editing
// affordances, and shows a bar with the version, date and author plus actions
// to restore it as a draft or exit back to the current draft.

import { EditAPI } from "./api";
import { applyContent, applyResponsive } from "./runtime";
import { BAR_H } from "./frame";
import type { WeblayConfig, Revision } from "./types";

const VIEW_KEY = "weblay:view";

export function pendingViewId(): string | null {
  return sessionStorage.getItem(VIEW_KEY);
}

// Render a revision read-only and mount the viewer bar. Returns false if the
// revision could not be loaded (caller falls back to normal rendering).
export async function startViewer(cfg: WeblayConfig, token: string): Promise<boolean> {
  const revId = pendingViewId();
  if (!revId) return false;

  let rev: Revision;
  try {
    rev = await new EditAPI(cfg, token).revision(revId);
  } catch {
    sessionStorage.removeItem(VIEW_KEY); // stale/invalid — drop it
    return false;
  }

  // Apply the historical manifest over the live (published) DOM.
  const elements = rev.manifest?.elements ?? {};
  for (const [selector, content] of Object.entries(elements)) {
    applyContent(selector, content);
  }
  applyResponsive(elements);

  mountViewerBar(rev, cfg, token);
  return true;
}

function mountViewerBar(rev: Revision, cfg: WeblayConfig, token: string): void {
  const doc = topDoc();
  const host = doc.createElement("div");
  host.setAttribute("data-weblay-ui", "");
  const shadow = host.attachShadow({ mode: "open" });

  const d = new Date(rev.publishedAt);
  const when = `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .bar {
        position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647;
        height: ${BAR_H}px; box-sizing: border-box;
        display: flex; align-items: center; gap: 14px; padding: 0 16px;
        background: #1a1206; color: #fde68a; border-top: 1px solid #78350f;
        font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .eye { display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto; font-weight: 700; color: #fbbf24; }
      .eye svg { width: 16px; height: 16px; }
      .info { flex: 1 1 auto; min-width: 0; color: #fcd34d; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .info b { color: #fff7ed; }
      .info .who { color: #d6a441; }
      button {
        font: inherit; border: 0; border-radius: 8px; padding: 8px 16px; cursor: pointer;
        display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto;
      }
      button svg { width: 14px; height: 14px; }
      .restore { background: #b45309; color: #fff; font-weight: 600; }
      .restore:hover { background: #d97706; }
      .exit { background: rgba(255,255,255,.08); color: #fde68a; }
      .exit:hover { background: rgba(255,255,255,.16); color: #fff; }
      @media (max-width: 640px) { .info .who { display: none; } button span.t { display: none; } }
    </style>
    <div class="bar">
      <span class="eye">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        Read-only
      </span>
      <span class="info">Viewing <b>version ${rev.version}</b> · ${escapeHTML(when)} · <span class="who">by ${escapeHTML(rev.publishedBy || "unknown")}</span></span>
      <button class="restore" id="restore"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/></svg><span class="t">Restore as draft</span></button>
      <button class="exit" id="exit"><span class="t">Back to editor</span></button>
    </div>`;

  const leave = () => { sessionStorage.removeItem(VIEW_KEY); (window.top ?? window).location.reload(); };
  shadow.getElementById("exit")!.addEventListener("click", leave);
  shadow.getElementById("restore")!.addEventListener("click", async () => {
    const btn = shadow.getElementById("restore") as HTMLButtonElement;
    btn.disabled = true;
    try {
      await new EditAPI(cfg, token).restoreDraft(rev.id);
      leave(); // back to the editor, now showing the restored draft
    } catch {
      btn.disabled = false;
      btn.querySelector("span")!.textContent = "Failed — retry";
    }
  });
  doc.body.appendChild(host);
}

function topDoc(): Document {
  try {
    if (window.frameElement && window.top?.document) return window.top.document;
  } catch { /* cross-origin */ }
  return document;
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
