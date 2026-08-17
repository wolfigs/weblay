// Version history drawer for the on-site editor. Lists published revisions
// (read-only) with date and author, and offers to view a version read-only or
// restore it as a draft. Renders into a provided document so it can live in the
// top window (above the stage iframe), matching the editor bar.

import type { Revision } from "./types";

export interface VersionsHandlers {
  list: () => Promise<Revision[]>;
  onView: (rev: Revision) => void;         // open a read-only preview
  onRestoreDraft: (rev: Revision) => Promise<void>; // copy into drafts
  liveVersion: () => number;               // currently published version
}

export class VersionsDrawer {
  private host: HTMLElement;
  private shadow: ShadowRoot;

  constructor(private doc: Document, private handlers: VersionsHandlers) {
    this.host = doc.createElement("div");
    this.host.setAttribute("data-weblay-ui", "");
    this.shadow = this.host.attachShadow({ mode: "open" });
    doc.body.appendChild(this.host);
  }

  async open(): Promise<void> {
    this.render(`<div class="loading">Loading versions…</div>`);
    try {
      const revs = await this.handlers.list();
      this.render(this.body(revs), revs);
    } catch (err) {
      this.render(`<div class="loading err">${esc((err as Error).message)}</div>`);
    }
  }

  private close = (): void => {
    this.host.querySelector(".wrap")?.classList.remove("open");
    setTimeout(() => { this.shadow.innerHTML = ""; }, 220);
    this.doc.removeEventListener("keydown", this.onKey);
  };

  private onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") this.close(); };

  private render(inner: string, revs?: Revision[]): void {
    this.shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .wrap { position: fixed; inset: 0; z-index: 2147483647;
          font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .scrim { position: absolute; inset: 0; background: rgba(0,0,0,.55);
          opacity: 0; transition: opacity .2s; }
        .wrap.open .scrim { opacity: 1; }
        .panel {
          position: absolute; top: 0; right: 0; bottom: 0; width: min(420px, 94vw);
          background: #0b0d17; border-left: 1px solid #272a3a; color: #e5e7eb;
          display: flex; flex-direction: column;
          transform: translateX(100%); transition: transform .24s cubic-bezier(.4,0,.2,1);
        }
        .wrap.open .panel { transform: none; }
        .head { display: flex; align-items: center; justify-content: space-between;
          padding: 16px 18px; border-bottom: 1px solid #1a1d2e; }
        .head h3 { margin: 0; font-size: 15px; }
        .head .x { background: none; border: 0; color: #9ca3af; cursor: pointer; font-size: 18px; line-height: 1; }
        .head .x:hover { color: #fff; }
        .body { flex: 1; overflow-y: auto; padding: 12px; }
        .loading { color: #6b7280; padding: 24px 8px; text-align: center; }
        .loading.err { color: #f87171; }
        .rev { border: 1px solid #1f2333; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; background: #10131f; }
        .rev.live { border-color: rgba(74,222,128,.4); }
        .rev-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .vtag { font-weight: 700; font-size: 13px; }
        .live-badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
          color: #4ade80; background: rgba(74,222,128,.12); padding: 2px 7px; border-radius: 999px; }
        .meta { color: #9ca3af; font-size: 12px; }
        .meta .who { color: #6b7280; }
        .rev-actions { display: flex; gap: 8px; margin-top: 10px; }
        .rev-actions button {
          flex: 1; border: 1px solid #272a3a; background: #161824; color: #d1d5db;
          border-radius: 7px; padding: 7px 0; cursor: pointer; font: inherit; font-size: 12px;
          display: inline-flex; align-items: center; justify-content: center; gap: 5px;
        }
        .rev-actions button:hover { background: #1f2333; color: #fff; }
        .rev-actions .restore { border-color: #3b1e78; color: #c7d2fe; background: #1c1830; }
        .rev-actions .restore:hover { background: #2a2350; }
        .rev-actions svg { width: 13px; height: 13px; }
        .empty { text-align: center; color: #6b7280; padding: 40px 10px; }
      </style>
      <div class="wrap">
        <div class="scrim" data-close></div>
        <div class="panel">
          <div class="head">
            <h3>Version history</h3>
            <button class="x" data-close aria-label="Close">✕</button>
          </div>
          <div class="body">${inner}</div>
        </div>
      </div>`;

    requestAnimationFrame(() => this.shadow.querySelector(".wrap")?.classList.add("open"));
    for (const el of Array.from(this.shadow.querySelectorAll<HTMLElement>("[data-close]"))) {
      el.onclick = this.close;
    }
    this.doc.addEventListener("keydown", this.onKey);

    if (revs) this.wire(revs);
  }

  private body(revs: Revision[]): string {
    if (!revs.length) {
      return `<div class="empty">No published versions yet.<br>Publish your edits to create the first one.</div>`;
    }
    const live = this.handlers.liveVersion();
    return revs.map((r) => {
      const isLive = r.version === live;
      const d = new Date(r.publishedAt);
      return `
      <div class="rev${isLive ? " live" : ""}">
        <div class="rev-top">
          <span class="vtag">Version ${r.version}</span>
          ${isLive ? `<span class="live-badge">Live</span>` : ""}
        </div>
        <div class="meta">${esc(d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }))} · ${esc(d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }))}<br>
          <span class="who">by ${esc(r.publishedBy || "unknown")}</span></div>
        <div class="rev-actions">
          <button data-view="${r.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>View</button>
          <button class="restore" data-restore="${r.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/></svg>Restore as draft</button>
        </div>
      </div>`;
    }).join("");
  }

  private wire(revs: Revision[]): void {
    const byId = new Map(revs.map((r) => [r.id, r]));
    for (const b of Array.from(this.shadow.querySelectorAll<HTMLElement>("[data-view]"))) {
      b.onclick = () => { const r = byId.get(b.dataset.view!); if (r) { this.close(); this.handlers.onView(r); } };
    }
    for (const b of Array.from(this.shadow.querySelectorAll<HTMLElement>("[data-restore]"))) {
      b.onclick = async () => {
        const r = byId.get(b.dataset.restore!);
        if (!r) return;
        b.textContent = "Restoring…";
        try { await this.handlers.onRestoreDraft(r); this.close(); }
        catch { b.textContent = "Failed — retry"; }
      };
    }
  }
}

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
