// Top-center activity indicator. Shows a spinner + label while an async editor
// action is in flight (Saving…, Publishing…, Uploading…), then resolves to a
// brief success (✓) or error (✗) state before fading out.
//
// It renders into a provided document so it can live in the top window, above
// the device-stage iframe, matching the editor bar.

type Kind = "busy" | "ok" | "err";

export class TopProgress {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private pill!: HTMLElement;
  private icon!: HTMLElement;
  private label!: HTMLElement;
  private hideTimer: number | undefined;

  constructor(doc: Document) {
    this.host = doc.createElement("div");
    this.host.setAttribute("data-weblay-ui", "");
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.build();
    doc.body.appendChild(this.host);
  }

  destroy(): void {
    clearTimeout(this.hideTimer);
    this.host.remove();
  }

  // Show a spinner with the given label; stays until settled or replaced.
  busy(label: string): void {
    clearTimeout(this.hideTimer);
    this.render("busy", label);
  }

  // Resolve to a success state, then auto-fade.
  ok(label: string): void {
    clearTimeout(this.hideTimer);
    this.render("ok", label);
    this.hideTimer = window.setTimeout(() => this.hide(), 1500);
  }

  // Resolve to an error state, then auto-fade (held longer so it's readable).
  err(label: string): void {
    clearTimeout(this.hideTimer);
    this.render("err", label);
    this.hideTimer = window.setTimeout(() => this.hide(), 2800);
  }

  hide(): void {
    clearTimeout(this.hideTimer);
    this.pill.className = "pill";
  }

  // Run an async task with automatic busy → ok/err feedback.
  async track<T>(busyLabel: string, okLabel: string, fn: () => Promise<T>): Promise<T> {
    this.busy(busyLabel);
    try {
      const out = await fn();
      this.ok(okLabel);
      return out;
    } catch (e) {
      this.err((e as Error).message || "Something went wrong");
      throw e;
    }
  }

  private render(kind: Kind, label: string): void {
    this.label.textContent = label;
    this.icon.className = `icon ${kind}`;
    this.icon.innerHTML = kind === "busy" ? `<span class="spin"></span>` : kind === "ok" ? CHECK : CROSS;
    this.pill.className = `pill show ${kind}`;
  }

  private build(): void {
    this.shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .pill {
          position: fixed; top: 14px; left: 50%; transform: translateX(-50%) translateY(-10px);
          z-index: 2147483647; display: inline-flex; align-items: center; gap: 9px;
          max-width: 80vw; padding: 9px 16px; border-radius: 999px;
          background: #0b0d17; color: #e5e7eb; border: 1px solid #272a3a;
          box-shadow: 0 8px 26px rgba(0,0,0,.5);
          font: 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-weight: 500;
          opacity: 0; pointer-events: none; transition: opacity .18s, transform .18s;
        }
        .pill.show { opacity: 1; transform: translateX(-50%) translateY(0); }
        .pill.ok  { border-color: rgba(74,222,128,.4); }
        .pill.err { border-color: rgba(248,113,113,.5); }
        .icon { display: inline-flex; width: 16px; height: 16px; flex: 0 0 auto; }
        .icon.ok { color: #4ade80; }
        .icon.err { color: #f87171; }
        .icon svg { width: 16px; height: 16px; }
        .spin {
          width: 15px; height: 15px; border-radius: 50%;
          border: 2px solid #313552; border-top-color: #a5b4fc;
          animation: weblay-spin .6s linear infinite; display: inline-block;
        }
        @keyframes weblay-spin { to { transform: rotate(360deg); } }
        .label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      </style>
      <div class="pill" id="pill">
        <span class="icon" id="icon"></span>
        <span class="label" id="label"></span>
      </div>`;
    this.pill = this.shadow.getElementById("pill")!;
    this.icon = this.shadow.getElementById("icon")!;
    this.label = this.shadow.getElementById("label")!;
  }
}

const CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
const CROSS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
