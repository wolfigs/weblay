// The visual editor. Injected only for authenticated editors: outlines
// editable elements, makes text editable in place, swaps images via upload,
// and drives the draft → publish flow. All UI lives in a Shadow DOM so site
// styles and editor styles never collide.

import { EditAPI } from "./api";
import { selectorFor } from "./selector";
import { applyContent } from "./runtime";
import type { ElementContent, InlayConfig } from "./types";

const TEXT_TAGS = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6", "SPAN", "A", "LI", "BLOCKQUOTE",
  "BUTTON", "FIGCAPTION", "TD", "TH", "DT", "DD", "LABEL", "SMALL", "STRONG", "EM",
]);

export class Editor {
  private api: EditAPI;
  private dirty = new Map<string, ElementContent>();
  private saving = false;
  private status!: HTMLElement;
  private toastEl!: HTMLElement;
  private active: HTMLElement | null = null;
  private originalText = "";

  constructor(cfg: InlayConfig, token: string, private editorName: string) {
    this.api = new EditAPI(cfg, token);
  }

  async start(): Promise<void> {
    const drafts = await this.api.drafts();
    for (const [selector, content] of Object.entries(drafts.elements)) {
      applyContent(selector, content); // show WIP over published content
    }
    this.injectStyles();
    this.buildBar();
    this.markEditable();
    this.setStatus("No unsaved changes");
  }

  // --- Element discovery ---

  private markEditable(): void {
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      if (el.closest("[data-inlay-ui]")) continue;
      if (el.tagName === "IMG") {
        el.classList.add("inlay-editable", "inlay-img");
        el.addEventListener("click", this.onImageClick);
        continue;
      }
      if (TEXT_TAGS.has(el.tagName) && this.isTextLeaf(el)) {
        el.classList.add("inlay-editable");
        el.addEventListener("click", this.onTextClick);
      }
    }
  }

  // Editable text elements are "leaves": no element children, so setting
  // textContent can't destroy nested markup.
  private isTextLeaf(el: HTMLElement): boolean {
    return el.children.length === 0 && (el.textContent ?? "").trim().length > 0;
  }

  // --- Text editing ---

  private onTextClick = (e: Event): void => {
    const el = e.currentTarget as HTMLElement;
    if (el.isContentEditable) return;
    e.preventDefault();
    e.stopPropagation();
    this.commitActive();

    this.active = el;
    this.originalText = el.textContent ?? "";
    el.setAttribute("contenteditable", "plaintext-only");
    el.classList.add("inlay-editing");
    el.focus();

    el.addEventListener("blur", this.onTextBlur, { once: true });
    el.addEventListener("keydown", this.onTextKeydown);
  };

  private onTextKeydown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (this.active) this.active.textContent = this.originalText;
      this.active?.blur();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.active?.blur();
    }
  };

  private onTextBlur = (e: Event): void => {
    const el = e.currentTarget as HTMLElement;
    el.removeAttribute("contenteditable");
    el.classList.remove("inlay-editing");
    el.removeEventListener("keydown", this.onTextKeydown);

    const text = el.textContent ?? "";
    if (text !== this.originalText) {
      const selector = selectorFor(el);
      this.dirty.set(selector, { ...this.dirty.get(selector), text });
      this.scheduleSave();
    }
    this.active = null;
  };

  private commitActive(): void {
    this.active?.blur();
  }

  // --- Image replacement ---

  private onImageClick = (e: Event): void => {
    const img = e.currentTarget as HTMLImageElement;
    e.preventDefault();
    e.stopPropagation();

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      this.setStatus("Uploading image…");
      try {
        const { url } = await this.api.upload(file);
        img.src = url;
        img.removeAttribute("srcset"); // the replacement must actually show
        const selector = selectorFor(img);
        const prev = this.dirty.get(selector);
        this.dirty.set(selector, {
          ...prev,
          attrs: { ...prev?.attrs, src: url, srcset: "" },
        });
        this.scheduleSave();
      } catch (err) {
        this.toast(`Upload failed: ${(err as Error).message}`, true);
        this.setStatus("Upload failed");
      }
    };
    input.click();
  };

  // --- Saving and publishing ---

  private saveTimer: number | undefined;

  private scheduleSave(): void {
    this.setStatus(`${this.dirty.size} unsaved change${this.dirty.size === 1 ? "" : "s"}…`);
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.flush(), 600);
  }

  private async flush(): Promise<void> {
    if (this.saving || this.dirty.size === 0) return;
    this.saving = true;
    const batch = new Map(this.dirty);
    this.dirty.clear();
    try {
      for (const [selector, content] of batch) {
        await this.api.saveDraft(selector, content);
      }
      if (this.dirty.size === 0) this.setStatus("Draft saved");
    } catch (err) {
      for (const [k, v] of batch) if (!this.dirty.has(k)) this.dirty.set(k, v);
      this.toast(`Save failed: ${(err as Error).message}`, true);
      this.setStatus("Save failed — changes kept locally");
    } finally {
      this.saving = false;
    }
  }

  private async publish(): Promise<void> {
    this.commitActive();
    await this.flush();
    if (this.dirty.size > 0) {
      this.toast("Fix the failed save before publishing", true);
      return;
    }
    this.setStatus("Publishing…");
    try {
      const { version } = await this.api.publish();
      this.setStatus("No unsaved changes");
      this.toast(`Published — version ${version} is live`);
    } catch (err) {
      this.toast(`Publish failed: ${(err as Error).message}`, true);
      this.setStatus("Publish failed");
    }
  }

  private exit(): void {
    sessionStorage.removeItem("inlay:token");
    location.reload();
  }

  // --- UI (Shadow DOM) ---

  private injectStyles(): void {
    const style = document.createElement("style");
    style.setAttribute("data-inlay-ui", "");
    style.textContent = `
      .inlay-editable { outline: 1.5px dashed rgba(99,102,241,.0); outline-offset: 2px; transition: outline-color .15s; cursor: pointer; }
      .inlay-editable:hover { outline-color: rgba(99,102,241,.8); }
      .inlay-editing { outline: 2px solid rgb(99,102,241) !important; cursor: text; }
      .inlay-img:hover { filter: brightness(.85); }
      body { margin-bottom: 64px !important; }
    `;
    document.head.appendChild(style);
  }

  private buildBar(): void {
    const host = document.createElement("div");
    host.setAttribute("data-inlay-ui", "");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .bar {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647;
          display: flex; align-items: center; gap: 16px; padding: 10px 20px;
          background: #0b0d17; color: #e5e7eb; border-top: 1px solid #272a3a;
          font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .brand { font-weight: 700; letter-spacing: .04em; color: #a5b4fc; }
        .who { color: #9ca3af; }
        .status { flex: 1; text-align: right; color: #9ca3af; }
        button {
          font: inherit; border: 0; border-radius: 8px; padding: 8px 18px; cursor: pointer;
        }
        .publish { background: #6366f1; color: #fff; font-weight: 600; }
        .publish:hover { background: #818cf8; }
        .exit { background: #1f2333; color: #d1d5db; }
        .exit:hover { background: #2a2f45; }
        .toast {
          position: fixed; bottom: 72px; left: 50%; transform: translateX(-50%);
          background: #16a34a; color: #fff; padding: 10px 22px; border-radius: 10px;
          font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          opacity: 0; transition: opacity .25s; pointer-events: none; max-width: 80vw;
        }
        .toast.error { background: #dc2626; }
        .toast.show { opacity: 1; }
      </style>
      <div class="bar">
        <span class="brand">INLAY</span>
        <span class="who">Editing as ${escapeHTML(this.editorName)} — click any text or image</span>
        <span class="status" id="status"></span>
        <button class="publish" id="publish">Publish</button>
        <button class="exit" id="exit">Exit</button>
      </div>
      <div class="toast" id="toast"></div>
    `;
    shadow.getElementById("publish")!.addEventListener("click", () => void this.publish());
    shadow.getElementById("exit")!.addEventListener("click", () => this.exit());
    this.status = shadow.getElementById("status")!;
    this.toastEl = shadow.getElementById("toast")!;
    document.body.appendChild(host);
  }

  private setStatus(text: string): void {
    this.status.textContent = text;
  }

  private toastTimer: number | undefined;

  private toast(text: string, isError = false): void {
    this.toastEl.textContent = text;
    this.toastEl.className = `toast show${isError ? " error" : ""}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.className = "toast";
    }, 3500);
  }
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
