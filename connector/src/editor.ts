// Visual editor — text/attribute/spacing editing in place, image replacement
// and resize. All editor chrome lives in Shadow DOM so site styles never interfere.

import { EditAPI } from "./api";
import { selectorFor } from "./selector";
import { applyContent } from "./runtime";
import { FloatingPanel } from "./panel";
import { ImageHandles } from "./handles";
import type { ElementContent, InlayConfig } from "./types";

const TEXT_TAGS = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6", "SPAN", "A", "LI", "BLOCKQUOTE",
  "BUTTON", "FIGCAPTION", "TD", "TH", "DT", "DD", "LABEL", "SMALL", "STRONG", "EM",
]);

export class Editor {
  private api: EditAPI;
  private dirty = new Map<string, ElementContent>();
  private committed = new Map<string, ElementContent>(); // mirrors last state saved to server
  private saving = false;
  private status!: HTMLElement;
  private toastEl!: HTMLElement;
  private selectedEl: HTMLElement | null = null;
  private textActive: HTMLElement | null = null;
  private originalText = "";
  private panel!: FloatingPanel;
  private handles!: ImageHandles;

  constructor(cfg: InlayConfig, token: string, private editorName: string) {
    this.api = new EditAPI(cfg, token);
  }

  async start(): Promise<void> {
    const drafts = await this.api.drafts();
    for (const [selector, content] of Object.entries(drafts.elements)) {
      this.committed.set(selector, content);
      applyContent(selector, content);
    }

    this.panel = new FloatingPanel();
    this.handles = new ImageHandles((size) => {
      if (!this.selectedEl) return;
      const sel = selectorFor(this.selectedEl);
      this.patchDirty(sel, { style: { width: `${size.widthPx}px`, height: `${size.heightPx}px` } });
      this.scheduleSave();
    });

    this.injectStyles();
    this.buildBar();
    this.markEditable();
    this.setStatus("No unsaved changes");

    // Capture-phase listener so we see all clicks before element handlers fire.
    document.addEventListener("click", this.onDocClick, true);
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

  private isTextLeaf(el: HTMLElement): boolean {
    return el.children.length === 0 && (el.textContent ?? "").trim().length > 0;
  }

  // --- Text editing ---

  private onTextClick = (e: Event): void => {
    const el = e.currentTarget as HTMLElement;
    e.preventDefault();
    e.stopPropagation();
    if (this.selectedEl === el && this.textActive === el) return;
    this.deselect();

    this.selectedEl = el;
    this.textActive = el;
    this.originalText = el.textContent ?? "";
    el.setAttribute("contenteditable", "plaintext-only");
    el.classList.add("inlay-editing");
    el.focus();
    el.addEventListener("blur", this.onTextBlur, { once: true });
    el.addEventListener("keydown", this.onTextKeydown);

    const selector = selectorFor(el);
    this.panel.show(el, this.dirty.get(selector) ?? {}, {
      onAttr: (key, value) => this.handleAttrChange(selector, el, key, value),
      onStyle: (prop, value) => this.handleStyleChange(selector, el, prop, value),
      onUpload: () => { /* text elements don't have image upload */ },
    });
  };

  private onTextKeydown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (this.textActive) this.textActive.textContent = this.originalText;
      this.textActive?.blur();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.textActive?.blur();
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
      this.patchDirty(selector, { text });
      this.scheduleSave();
    }
    this.textActive = null;
  };

  // --- Image selection & resize ---

  private onImageClick = (e: Event): void => {
    const img = e.currentTarget as HTMLImageElement;
    e.preventDefault();
    e.stopPropagation();
    if (this.selectedEl === img) return;
    this.deselect();

    this.selectedEl = img;
    img.classList.add("inlay-selected");
    this.handles.attach(img);

    const selector = selectorFor(img);
    this.panel.show(
      img,
      this.dirty.get(selector) ?? {},
      {
        onAttr: (key, value) => this.handleAttrChange(selector, img, key, value),
        onStyle: (prop, value) => this.handleStyleChange(selector, img, prop, value),
        onUpload: (file) => void this.uploadAndReplace(img, selector, file),
      },
      true,
    );
  };

  private async uploadAndReplace(img: HTMLImageElement, selector: string, file: File): Promise<void> {
    this.setStatus("Uploading image…");
    try {
      const { url } = await this.api.upload(file);
      img.src = url;
      img.removeAttribute("srcset");
      this.handleAttrChange(selector, img, "src", url);
      this.handleAttrChange(selector, img, "srcset", "");
    } catch (err) {
      this.toast(`Upload failed: ${(err as Error).message}`, true);
      this.setStatus("Upload failed");
    }
  }

  // --- Attribute and style change handlers ---

  private handleAttrChange(selector: string, el: HTMLElement, key: string, value: string): void {
    el.setAttribute(key, value);
    this.patchDirty(selector, { attrs: { [key]: value } });
    this.scheduleSave();
  }

  private handleStyleChange(selector: string, el: HTMLElement, prop: string, value: string): void {
    el.style.setProperty(prop, value);
    this.patchDirty(selector, { style: { [prop]: value } });
    this.scheduleSave();
  }

  private patchDirty(selector: string, patch: Partial<ElementContent>): void {
    // After flush() clears dirty, fall back to committed so previously-saved
    // attrs (e.g. a replaced image src) aren't lost when adding new style changes.
    const prev = this.dirty.get(selector) ?? this.committed.get(selector) ?? {};
    this.dirty.set(selector, {
      ...prev,
      ...(patch.text !== undefined ? { text: patch.text } : {}),
      ...(patch.html !== undefined ? { html: patch.html } : {}),
      attrs: patch.attrs ? { ...(prev.attrs ?? {}), ...patch.attrs } : prev.attrs,
      style: patch.style ? { ...(prev.style ?? {}), ...patch.style } : prev.style,
    });
  }

  // --- Selection lifecycle ---

  private deselect(): void {
    if (this.textActive) {
      this.textActive.blur();
      // onTextBlur fires synchronously on blur() and clears this.textActive
    }
    if (this.selectedEl) {
      this.selectedEl.classList.remove("inlay-selected");
      this.selectedEl = null;
    }
    this.handles.detach();
    this.panel.hide();
  }

  private onDocClick = (e: MouseEvent): void => {
    const el = e.target instanceof HTMLElement ? e.target : null;
    if (!el) return;
    if (el.closest("[data-inlay-ui]")) return; // panel, handles, bar
    if (el.classList.contains("inlay-editable")) return; // handled by specific listeners
    this.deselect();
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
        this.committed.set(selector, content);
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
    if (this.textActive) this.textActive.blur();
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
      .inlay-editable {
        outline: 1.5px dashed rgba(99,102,241,0);
        outline-offset: 2px; transition: outline-color .15s; cursor: pointer;
      }
      .inlay-editable:hover { outline-color: rgba(99,102,241,.8); }
      .inlay-editing { outline: 2px solid rgb(99,102,241) !important; cursor: text; }
      .inlay-selected { outline: 2px solid #6366f1 !important; outline-offset: 2px; }
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
        button { font: inherit; border: 0; border-radius: 8px; padding: 8px 18px; cursor: pointer; }
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
