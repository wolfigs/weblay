// Visual editor — text/attribute/spacing editing in place, image replacement
// and resize. All editor chrome lives in Shadow DOM so site styles never interfere.

import { EditAPI, ConflictError } from "./api";
import { selectorFor } from "./selector";
import { applyContent } from "./runtime";
import { FloatingPanel } from "./panel";
import { ImageHandles } from "./handles";
import { SpacingHandles } from "./spacing";
import { RichToolbar } from "./toolbar";
import { sanitizeHTML, isPlainText, isSafeCSSProp, isSafeCSSValue } from "./sanitize";
import { PRESETS } from "./breakpoints";
import { BAR_H } from "./frame";
import { VersionsDrawer } from "./versions";
import { TopProgress } from "./progress";
import { buildDescriptor, assessRisk, riskSummary, type Descriptor, type BindRisk } from "./descriptor";
import { LayersPanel } from "./layers";
import type { Revision } from "./types";
import type { ElementContent, WeblayConfig } from "./types";

const TEXT_TAGS = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6", "SPAN", "A", "LI", "BLOCKQUOTE",
  "BUTTON", "FIGCAPTION", "TD", "TH", "DT", "DD", "LABEL", "SMALL", "STRONG", "EM",
]);

// Block/container tags that can be selected for style + spacing (not text) when
// they contain other elements. Lets editors style layout wrappers like <div>.
const CONTAINER_TAGS = new Set([
  "DIV", "SECTION", "ARTICLE", "ASIDE", "HEADER", "FOOTER", "MAIN", "NAV",
  "UL", "OL", "FORM", "FIGURE", "FIELDSET", "PICTURE", "TABLE", "TR",
]);

// Inline formatting tags a rich-text element may contain and remain editable.
// Mirrors the sanitizer's inline allowlist (see sanitize.ts TAG_ALLOW).
const INLINE_TAGS = new Set([
  "A", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL", "INS",
  "CODE", "MARK", "SUB", "SUP", "SMALL", "SPAN", "BR", "ABBR", "Q",
  "FONT", "WBR", "TIME", "CITE", "VAR", "KBD", "SAMP",
]);

// Map of a keyboard shortcut key to the rich-text command it fires.
const FORMAT_KEYS: Record<string, string> = { b: "bold", i: "italic", u: "underline", k: "createLink" };

interface HistoryStep {
  selector: string;
  before: ElementContent;
  after: ElementContent;
}

// A single edit. html:null explicitly clears a previously-set html override.
interface ContentPatch {
  text?: string;
  html?: string | null;
  attrs?: Record<string, string>;
  style?: Record<string, string>;
  media?: Record<string, Record<string, string>>; // breakpoint id → styles
}

function cloneContent(c: ElementContent): ElementContent {
  return JSON.parse(JSON.stringify(c ?? {}));
}

// Snapshot of an element's original values for the properties an override
// touches — enough to non-destructively toggle back to the original.
interface OrigSnapshot {
  html?: string;                          // original innerHTML (text/html overrides)
  attrs?: Record<string, string | null>;  // original attribute values (null = absent)
  style?: string | null;                  // original inline style attribute
}

function isEmptyContent(c: ElementContent): boolean {
  return !c || (c.text === undefined && c.html === undefined &&
    !(c.attrs && Object.keys(c.attrs).length) &&
    !(c.style && Object.keys(c.style).length) &&
    !(c.media && Object.values(c.media).some((b) => Object.keys(b).length)));
}

// Every style property set on an element across the base bucket and all
// breakpoint buckets — used to know what to clear on undo/redo.
function allStyleProps(c: ElementContent): Set<string> {
  const props = new Set<string>(Object.keys(c.style ?? {}));
  for (const bucket of Object.values(c.media ?? {})) {
    for (const p of Object.keys(bucket)) props.add(p);
  }
  return props;
}

export class Editor {
  private api: EditAPI;
  private dirty = new Map<string, ElementContent>();
  private committed = new Map<string, ElementContent>(); // mirrors last state saved to server
  private saving = false;
  private unpublished = 0; // drafts saved since the last publish
  private status!: HTMLElement;
  private toastEl!: HTMLElement;
  private pubCount: HTMLElement | null = null;
  private selectedEl: HTMLElement | null = null;
  private selectedIsImage = false;
  private textActive: HTMLElement | null = null;
  private originalHTML = "";
  private panel!: FloatingPanel;
  private handles!: ImageHandles;
  private spacing!: SpacingHandles;
  private toolbar!: RichToolbar;
  private undoStack: HistoryStep[] = [];
  private redoStack: HistoryStep[] = [];
  private applyingHistory = false;
  private previewW = Infinity; // iframe preview width; Infinity = full desktop
  private activeMax = 0;       // media threshold edits target; 0 = base styles
  private publishedVersion = 0;
  private progress!: TopProgress;
  // Identity descriptor + bind-time risk per selector, captured on selection and
  // sent with each save so the server can track drift health.
  private descriptors = new Map<string, { descriptor: Descriptor; risk: BindRisk }>();
  // Original (pre-override) state per selector, for non-destructive "peek".
  private origState = new Map<string, OrigSnapshot>();
  private peeking = false;      // whole-page peek active
  private peekSticky = false;   // double-click latched peek
  private peekBtn!: HTMLElement;
  private layers!: LayersPanel;
  private layersBtn!: HTMLElement;
  private layerHover: HTMLElement | null = null;
  // Guided re-bind: re-point a drifted override onto a newly-clicked element.
  private rebinding: { oldSelector: string; content: ElementContent } | null = null;
  private rebindHost: HTMLElement | null = null;
  private rebindHover: HTMLElement | null = null;

  constructor(cfg: WeblayConfig, token: string, private editorName: string) {
    this.api = new EditAPI(cfg, token);
  }

  async start(): Promise<void> {
    this.progress = new TopProgress(this.topDoc());
    this.progress.busy("Loading editor…");
    const drafts = await this.api.drafts();
    this.publishedVersion = drafts.publishedVersion ?? 0;
    for (const [selector, content] of Object.entries(drafts.elements)) {
      this.committed.set(selector, content);
      this.snapshotOriginal(selector, content); // capture original BEFORE applying (for peek)
      applyContent(selector, content);
    }

    this.panel = new FloatingPanel();
    this.toolbar = new RichToolbar({ onChange: () => this.onRichChange() });
    this.handles = new ImageHandles((size) => {
      if (!this.selectedEl) return;
      const sel = selectorFor(this.selectedEl);
      this.commitStyle(sel, "width", `${size.widthPx}px`);
      this.commitStyle(sel, "height", `${size.heightPx}px`);
    });
    this.spacing = new SpacingHandles(
      // Live drag: just show it; nothing persisted yet.
      () => { /* inline style already updated by the overlay */ },
      (prop, val) => {
        if (!this.selectedEl) return;
        this.commitStyle(selectorFor(this.selectedEl), prop, `${val}px`);
      },
    );

    // Render the layers panel in the top window so it can occupy the space
    // beside a narrow device stage (instead of covering the preview), operating
    // on this (page) document's elements.
    this.layers = new LayersPanel(this.topDoc(), document, {
      onSelect: (el) => this.selectFromLayers(el), // showPanel syncs the tree
      onHover: (el) => this.setLayerHover(el),
      onClose: () => { this.layersBtn?.classList.remove("on"); this.shiftStageForLayers(false); },
      overrideSelectors: () => new Set([...this.committed.keys(), ...this.dirty.keys()]),
      selectorFor: (el) => selectorFor(el),
    });

    this.injectStyles();
    this.buildBar();
    this.markEditable();
    this.setStatus("No unsaved changes");

    // Capture-phase listener so we see all clicks before element handlers fire.
    document.addEventListener("click", this.onDocClick, true);
    document.addEventListener("selectionchange", this.onSelectionChange);
    document.addEventListener("keydown", this.onGlobalKeydown, true);
    document.addEventListener("mouseover", this.onHover, true);

    this.progress.ok("Editor ready");

    // If we arrived via a dashboard "Re-bind" link, enter pick mode.
    const reb = sessionStorage.getItem("weblay:rebind");
    if (reb) { sessionStorage.removeItem("weblay:rebind"); this.enterRebind(reb); }
  }

  // --- Guided re-bind (Phase 2: drift correction) ---

  private enterRebind(oldSelector: string): void {
    const content = this.dirty.get(oldSelector) ?? this.committed.get(oldSelector);
    if (!content) {
      this.toast("That override's content couldn't be found — edit the element directly instead.", true);
      return;
    }
    this.deselect();
    this.rebinding = { oldSelector, content };
    this.buildRebindBanner(content);
    document.addEventListener("mouseover", this.onRebindHover, true);
    document.addEventListener("click", this.onRebindClick, true);
    this.progress.busy("Re-bind: click the element this edit belongs to");
  }

  private buildRebindBanner(content: ElementContent): void {
    const doc = this.topDoc();
    const host = doc.createElement("div");
    host.setAttribute("data-weblay-ui", "");
    const shadow = host.attachShadow({ mode: "open" });
    const preview = escapeHTML((content.text ?? content.html ?? "(styles/attributes)").replace(/<[^>]+>/g, " ").trim().slice(0, 60));
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .bar { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
          display: flex; align-items: center; gap: 12px; max-width: 92vw;
          background: #2e1065; color: #ddd6fe; border: 1px solid #6d28d9; border-radius: 12px;
          padding: 10px 14px; box-shadow: 0 12px 40px rgba(0,0,0,.5);
          font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        b { color: #fff; }
        .prev { color: #c4b5fd; font-style: italic; max-width: 30vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        button { font: inherit; border: 0; border-radius: 8px; padding: 6px 12px; cursor: pointer;
          background: rgba(255,255,255,.12); color: #fff; }
        button:hover { background: rgba(255,255,255,.22); }
      </style>
      <div class="bar">
        <b>Re-binding</b><span class="prev">"${preview}"</span>
        <span>— click the element it should apply to</span>
        <button id="cancel">Cancel</button>
      </div>`;
    shadow.getElementById("cancel")!.addEventListener("click", () => this.exitRebind());
    doc.body.appendChild(host);
    this.rebindHost = host;
  }

  private onRebindHover = (e: Event): void => {
    const el = pickTarget(e.target);
    if (el === this.rebindHover) return;
    this.rebindHover?.classList.remove("weblay-rebind-hover");
    this.rebindHover = el;
    this.rebindHover?.classList.add("weblay-rebind-hover");
  };

  private onRebindClick = (e: MouseEvent): void => {
    const el = pickTarget(e.target);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    void this.doRebind(el);
  };

  private async doRebind(el: HTMLElement): Promise<void> {
    if (!this.rebinding) return;
    const { oldSelector, content } = this.rebinding;
    const newSelector = selectorFor(el);
    if (newSelector === oldSelector) { this.toast("That's the same element.", false); return; }

    const risk = riskSummary(assessRisk(el));
    const ok = await this.confirmDialog(
      `Re-bind to this <${el.tagName.toLowerCase()}>?`,
      `The override will move to this element and publish.${risk ? " " + risk : ""}`,
      "Re-bind here",
    );
    if (!ok) return;

    this.progress.busy("Re-binding…");
    try {
      const descriptor = buildDescriptor(el);
      const bindRisk = assessRisk(el);
      await this.api.saveDraft(newSelector, content, descriptor, bindRisk);
      await this.api.removeOverride(oldSelector);
      await this.api.publish();
      this.progress.ok("Re-bound & published");
      this.toast("Override re-bound to the new element", "success");
      this.exitRebind();
      setTimeout(() => (window.top ?? window).location.reload(), 700);
    } catch (err) {
      this.progress.err("Re-bind failed");
      this.toast(`Re-bind failed: ${(err as Error).message}`, true);
    }
  }

  private exitRebind(): void {
    document.removeEventListener("mouseover", this.onRebindHover, true);
    document.removeEventListener("click", this.onRebindClick, true);
    this.rebindHover?.classList.remove("weblay-rebind-hover");
    this.rebindHost?.remove();
    this.rebindHost = null;
    this.rebindHover = null;
    this.rebinding = null;
    this.progress.hide();
  }

  // --- Element discovery ---

  private markEditable(): void {
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      if (el.closest("[data-weblay-ui]")) continue;
      if (el.tagName === "IMG") {
        el.classList.add("weblay-editable", "weblay-img");
        el.addEventListener("click", this.onImageClick);
        continue;
      }
      if (TEXT_TAGS.has(el.tagName) && this.isTextEditable(el)) {
        el.classList.add("weblay-editable");
        el.addEventListener("click", this.onTextClick);
        continue;
      }
      if (CONTAINER_TAGS.has(el.tagName)) {
        el.classList.add("weblay-editable", "weblay-box");
        el.addEventListener("click", this.onContainerClick);
      }
    }
  }

  // A text element is editable when it holds text and its only descendants are
  // inline formatting (b, i, a, span, …). Crucially this stays true after a
  // formatted draft is applied — otherwise re-visiting an edited element (now
  // containing <b>/<a>) would leave it uneditable.
  private isTextEditable(el: HTMLElement): boolean {
    return (el.textContent ?? "").trim().length > 0 && this.hasOnlyInline(el);
  }

  private hasOnlyInline(el: HTMLElement): boolean {
    for (const child of Array.from(el.children)) {
      if (!INLINE_TAGS.has(child.tagName)) return false; // a block/img => container
      if (!this.hasOnlyInline(child as HTMLElement)) return false;
    }
    return true;
  }

  // --- Text editing ---

  private onTextClick = (e: MouseEvent): void => {
    const el = e.currentTarget as HTMLElement;
    // Modifier-click follows a link normally so editors can navigate the site
    // (the session token lives in sessionStorage, so the next page stays editable).
    if (el.tagName === "A" && (e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    e.stopPropagation();
    this.beginTextEdit(el);
  };

  // Start rich text editing on an element (shared by click + the layers panel).
  private beginTextEdit(el: HTMLElement): void {
    if (this.selectedEl === el && this.textActive === el) return;
    this.deselect();

    this.selectedEl = el;
    this.textActive = el;
    this.originalHTML = el.innerHTML;
    this.recordOrigHtml(selectorFor(el), el); // capture the very-original for peek
    // Rich contenteditable: inline formatting (bold/italic/link/…) is allowed
    // and sanitized on save. Block splitting is prevented in onTextKeydown.
    el.setAttribute("contenteditable", "true");
    el.classList.add("weblay-editing");
    el.focus();
    el.addEventListener("blur", this.onTextBlur, { once: true });
    el.addEventListener("keydown", this.onTextKeydown);
    this.toolbar.setEditable(el);

    this.showPanel(el, selectorFor(el), false);
  }

  // Show the property panel with the style view scoped to the current preview
  // width, so displayed values and edits both target the right media bucket.
  private showPanel(el: HTMLElement, selector: string, isImage: boolean): void {
    this.selectedIsImage = isImage;
    // Capture identity + bind-time risk for this element (detection channel #1).
    const risk = this.captureDescriptor(el, selector);
    const content = this.contentFor(selector);
    const view: ElementContent = { ...content, style: this.effectiveStyle(content, this.previewW) };
    const hasParent = !isImage && this.hasSelectableParent(el);
    this.panel.show(
      el,
      view,
      {
        onAttr: (key, value) => this.handleAttrChange(selector, el, key, value),
        onStyle: (prop, value) => this.commitStyle(selector, prop, value),
        onUpload: (file) => void this.uploadAndReplace(el as HTMLImageElement, selector, file),
        onTab: (tab) => this.syncOverlays(tab),
        onParent: hasParent ? () => this.selectParent(el) : undefined,
        onPeek: this.origState.has(selector) ? (on) => this.peekElement(selector, on) : undefined,
        onReset: () => void this.resetElement(selector),
        hasOverride: this.dirty.has(selector) || this.committed.has(selector),
      },
      isImage,
      this.activeMax > 0 ? `≤ ${this.activeMax}px` : null,
      riskSummary(risk),
    );
    this.syncOverlays("a"); // panel opens on the Content tab
    this.layers?.markSelected(el); // keep the layers tree in sync with page selection
  }

  // Build + store the descriptor/risk for a selector, returning the risk so the
  // panel can warn. Recomputed on each selection so it reflects the live DOM.
  private captureDescriptor(el: HTMLElement, selector: string): BindRisk {
    const descriptor = buildDescriptor(el);
    const risk = assessRisk(el);
    this.descriptors.set(selector, { descriptor, risk });
    return risk;
  }

  // Show the right overlay for the active panel tab: the spacing (padding/margin)
  // grips appear only on the Spacing tab; image resize handles appear on the
  // other tabs. Keeps the canvas uncluttered until spacing is being edited.
  private syncOverlays(tab: string): void {
    const el = this.selectedEl;
    if (!el) return;
    if (tab === "s") {
      this.handles.detach();
      this.spacing.attach(el);
    } else {
      this.spacing.detach();
      if (this.selectedIsImage && el instanceof HTMLImageElement) this.handles.attach(el);
      else this.handles.detach();
    }
  }

  private hasSelectableParent(el: HTMLElement): boolean {
    let p = el.parentElement;
    while (p && p !== document.body) {
      if (p.classList.contains("weblay-editable") && !p.closest("[data-weblay-ui]")) return true;
      p = p.parentElement;
    }
    return false;
  }

  private onTextKeydown = (e: KeyboardEvent): void => {
    // Formatting shortcuts (⌘/Ctrl + B/I/U/K) route through the toolbar so a
    // save is scheduled and button states stay in sync.
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const cmd = FORMAT_KEYS[e.key.toLowerCase()];
      if (cmd) { e.preventDefault(); this.toolbar.run(cmd); return; }
      return; // let ⌘Z/⌘A/⌘C etc. behave natively inside the field
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (this.textActive) this.textActive.innerHTML = this.originalHTML;
      this.textActive?.blur();
    } else if (e.key === "Enter" && !e.shiftKey) {
      // Single inline region: Enter commits. Shift+Enter inserts a <br>.
      e.preventDefault();
      this.textActive?.blur();
    }
  };

  // Called by the toolbar after it mutates the selection's markup.
  private onRichChange(): void {
    if (!this.textActive) return;
    const selector = selectorFor(this.textActive);
    this.persistRichText(selector, this.textActive);
  }

  private onTextBlur = (e: Event): void => {
    const el = e.currentTarget as HTMLElement;
    el.removeAttribute("contenteditable");
    el.classList.remove("weblay-editing");
    el.removeEventListener("keydown", this.onTextKeydown);
    this.toolbar.setEditable(null);
    this.toolbar.hide();

    if (el.innerHTML !== this.originalHTML) {
      this.persistRichText(selectorFor(el), el);
    }
    this.textActive = null;
  };

  // Store the element's edited content as plain text when unformatted, or as
  // sanitized HTML when it carries inline formatting.
  private persistRichText(selector: string, el: HTMLElement): void {
    const clean = sanitizeHTML(el.innerHTML);
    if (isPlainText(clean)) {
      this.patchDirty(selector, { text: el.textContent ?? "", html: null });
    } else {
      this.patchDirty(selector, { html: clean });
    }
    this.scheduleSave();
  }

  // --- Image selection & resize ---

  private onImageClick = (e: Event): void => {
    const img = e.currentTarget as HTMLImageElement;
    e.preventDefault();
    e.stopPropagation();
    if (this.selectedEl === img) return;
    this.deselect();

    this.selectedEl = img;
    img.classList.add("weblay-selected");
    this.showPanel(img, selectorFor(img), true); // resize/spacing overlays follow the active tab
  };

  // --- Container (div/section/…) selection: style + spacing only ---

  private onContainerClick = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    this.selectContainer(e.currentTarget as HTMLElement);
  };

  private selectContainer(el: HTMLElement): void {
    if (this.selectedEl === el) return;
    this.deselect();
    this.selectedEl = el;
    el.classList.add("weblay-selected");
    this.showPanel(el, selectorFor(el), false);
  }

  // Select any element from the layers panel — reveals it if hidden, scrolls it
  // into view, and routes to the right editing mode (text / image / style).
  private selectFromLayers(el: HTMLElement): void {
    el.classList.add("weblay-force-visible"); // temporary reveal for hidden elements
    try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { /* ignore */ }
    if (el.tagName === "IMG") {
      this.deselect();
      this.selectedEl = el;
      el.classList.add("weblay-selected");
      this.showPanel(el, selectorFor(el), true);
    } else if (this.isTextEditable(el)) {
      this.beginTextEdit(el);
    } else {
      this.selectContainer(el);
    }
  }

  // Climb to the nearest selectable ancestor — the way to reach an outer
  // wrapper when containers are nested.
  private selectParent(el: HTMLElement): void {
    let p = el.parentElement;
    while (p && p !== document.body) {
      if (p.classList.contains("weblay-editable") && !p.closest("[data-weblay-ui]")) {
        this.selectContainer(p);
        return;
      }
      p = p.parentElement;
    }
  }

  private async uploadAndReplace(img: HTMLImageElement, selector: string, file: File): Promise<void> {
    this.setStatus("Uploading image…");
    this.progress.busy("Uploading image…");
    try {
      const { url } = await this.api.upload(file);
      // Record originals before mutating, so peek reverts to the very-original image.
      this.recordOrigAttr(selector, img, "src");
      this.recordOrigAttr(selector, img, "srcset");
      img.src = url;
      img.removeAttribute("srcset");
      this.handleAttrChange(selector, img, "src", url);
      this.handleAttrChange(selector, img, "srcset", "");
      this.progress.ok("Image updated");
    } catch (err) {
      this.progress.err("Upload failed");
      this.toast(`Upload failed: ${(err as Error).message}`, true);
      this.setStatus("Upload failed");
    }
  }

  // --- Peek (non-destructive original preview) + reset ---

  // Capture an element's original values for the properties this override
  // touches, so peek can toggle back without losing the edit.
  private snapshotOriginal(selector: string, content: ElementContent): void {
    if (this.origState.has(selector)) return;
    let el: HTMLElement | null = null;
    try { el = document.querySelector<HTMLElement>(selector); } catch { return; }
    if (!el) return;
    const snap: OrigSnapshot = {};
    if (content.text !== undefined || content.html !== undefined) snap.html = el.innerHTML;
    if (content.attrs) {
      snap.attrs = {};
      for (const k of Object.keys(content.attrs)) snap.attrs[k] = el.getAttribute(k);
    }
    if (content.style || content.media) snap.style = el.getAttribute("style");
    this.origState.set(selector, snap);
  }

  // Record an element's original values just before it's first changed, so peek
  // can restore the *very original* page — even for elements edited mid-session.
  private origFor(selector: string): OrigSnapshot {
    let snap = this.origState.get(selector);
    if (!snap) { snap = {}; this.origState.set(selector, snap); }
    return snap;
  }
  private recordOrigHtml(selector: string, el: HTMLElement): void {
    const snap = this.origFor(selector);
    if (snap.html === undefined) snap.html = el.innerHTML;
  }
  private recordOrigAttr(selector: string, el: HTMLElement, key: string): void {
    const snap = this.origFor(selector);
    if (!snap.attrs) snap.attrs = {};
    if (!(key in snap.attrs)) snap.attrs[key] = el.getAttribute(key);
  }
  private recordOrigStyle(selector: string, el: HTMLElement): void {
    const snap = this.origFor(selector);
    if (snap.style === undefined) snap.style = el.getAttribute("style");
  }

  private restoreOriginal(selector: string): void {
    const snap = this.origState.get(selector);
    let el: HTMLElement | null = null;
    try { el = document.querySelector<HTMLElement>(selector); } catch { return; }
    if (!el || !snap) return;
    if (snap.html !== undefined) el.innerHTML = snap.html;
    if (snap.attrs) for (const [k, v] of Object.entries(snap.attrs)) v === null ? el.removeAttribute(k) : el.setAttribute(k, v);
    if (snap.style !== undefined) snap.style === null ? el.removeAttribute("style") : el.setAttribute("style", snap.style);
  }

  private reapplyOverride(selector: string): void {
    const content = this.dirty.get(selector) ?? this.committed.get(selector);
    if (content) applyContent(selector, content);
    this.refreshPreview(selector);
  }

  // Toggle whole-page peek: show every element's original, or re-apply overrides.
  private togglePeek(on: boolean): void {
    if (on === this.peeking) return;
    this.peeking = on;
    if (on) this.deselect();
    for (const sel of new Set([...this.origState.keys(), ...this.committed.keys(), ...this.dirty.keys()])) {
      if (on) this.restoreOriginal(sel); else this.reapplyOverride(sel);
    }
    this.setPeekButton(on);
    this.setStatus(on ? "Peeking original — edits hidden" : "No unsaved changes");
  }

  // Peek a single element (used by the panel's press-and-hold).
  private peekElement(selector: string, on: boolean): void {
    if (on) this.restoreOriginal(selector); else this.reapplyOverride(selector);
  }

  // Reset one element to original: remove the override server-side (publishes)
  // and restore the original in place.
  private async resetElement(selector: string): Promise<void> {
    const ok = await this.confirmReset(
      "Reset this element?",
      "This removes your override and publishes the original content live. You can restore it from version history.",
    );
    if (!ok) return;
    this.progress.busy("Resetting…");
    try {
      await this.api.resetElement(selector);
      this.restoreOriginal(selector);
      this.dirty.delete(selector);
      this.committed.delete(selector);
      this.origState.delete(selector);
      this.descriptors.delete(selector);
      this.undoStack = [];
      this.redoStack = [];
      this.deselect();
      this.layers?.refresh(); // clear the "edited" badge in the tree
      this.progress.ok("Reset to original");
      this.toast("Element reset — original is live", "success");
    } catch (err) {
      this.progress.err("Reset failed");
      this.toast(`Reset failed: ${(err as Error).message}`, true);
    }
  }

  // --- Attribute and style change handlers ---

  private handleAttrChange(selector: string, el: HTMLElement, key: string, value: string): void {
    this.recordOrigAttr(selector, el, key); // capture original before changing
    if (value === "") {
      el.removeAttribute(key);
    } else {
      el.setAttribute(key, value);
    }
    this.patchDirty(selector, { attrs: { [key]: value } });
    this.scheduleSave();
  }

  // Route a style edit to the active threshold's bucket. At desktop (activeMax
  // 0) this is the base `style`; otherwise it lands in `media[activeMax]` and
  // applies at that width and below. The element updates live via preview.
  private commitStyle(selector: string, prop: string, value: string): void {
    if (!isSafeCSSProp(prop) || !isSafeCSSValue(value)) return;
    const el = document.querySelector<HTMLElement>(selector);
    if (el) this.recordOrigStyle(selector, el); // capture original style before changing
    if (this.activeMax <= 0) {
      this.patchDirty(selector, { style: { [prop]: value } });
    } else {
      this.patchDirty(selector, { media: { [String(this.activeMax)]: { [prop]: value } } });
    }
    this.refreshPreview(selector);
    this.scheduleSave();
  }

  // Merge base + media buckets as they'd apply at viewport width `atWidth`
  // (desktop-first cascade): base everywhere, then every bucket whose threshold
  // is ≥ atWidth, applied widest-first so the narrowest wins.
  private effectiveStyle(content: ElementContent, atWidth: number): Record<string, string> {
    const out: Record<string, string> = { ...(content.style ?? {}) };
    const media = content.media ?? {};
    const keys = Object.keys(media)
      .map((k) => [k, parseInt(k, 10)] as const)
      .filter(([, n]) => Number.isFinite(n) && n >= atWidth)
      .sort((a, b) => b[1] - a[1]); // widest first → narrowest applied last
    for (const [k] of keys) Object.assign(out, media[k]);
    return out;
  }

  // Re-apply the effective inline styles at the current preview width so the
  // page shows how it looks there. Props present in any bucket but not in the
  // effective set are cleared, so changing width reverts cleanly.
  private refreshPreview(selector?: string): void {
    const selectors = selector ? [selector] : this.editedSelectors();
    for (const sel of selectors) {
      const content = this.contentFor(sel);
      let el: HTMLElement | null = null;
      try { el = document.querySelector<HTMLElement>(sel); } catch { continue; }
      if (!el) continue;

      const effective = this.effectiveStyle(content, this.previewW);
      // Candidate props = everything ever set on this element across buckets.
      const candidates = new Set<string>(Object.keys(content.style ?? {}));
      for (const bucket of Object.values(content.media ?? {})) {
        for (const p of Object.keys(bucket)) candidates.add(p);
      }
      for (const prop of candidates) {
        const v = effective[prop];
        if (v && v !== "" && isSafeCSSProp(prop) && isSafeCSSValue(v)) el.style.setProperty(prop, v);
        else el.style.removeProperty(prop);
      }
    }
  }

  private editedSelectors(): string[] {
    return Array.from(new Set([...this.dirty.keys(), ...this.committed.keys()]));
  }

  private contentFor(selector: string): ElementContent {
    return this.dirty.get(selector) ?? this.committed.get(selector) ?? {};
  }

  private patchDirty(selector: string, patch: ContentPatch): void {
    // After flush() clears dirty, fall back to committed so previously-saved
    // attrs (e.g. a replaced image src) aren't lost when adding new changes.
    const wasTracked = this.dirty.has(selector) || this.committed.has(selector);
    const prev = this.dirty.get(selector) ?? this.committed.get(selector) ?? {};
    const before = cloneContent(prev);
    const next: ElementContent = { ...prev };

    if (patch.text !== undefined) { next.text = patch.text; delete next.html; }
    if (patch.html !== undefined) {
      if (patch.html === null) delete next.html;
      else { next.html = patch.html; delete next.text; }
    }
    if (patch.attrs) next.attrs = { ...(next.attrs ?? {}), ...patch.attrs };
    if (patch.style) next.style = { ...(next.style ?? {}), ...patch.style };
    if (patch.media) {
      next.media = { ...(next.media ?? {}) };
      for (const [bp, styles] of Object.entries(patch.media)) {
        next.media[bp] = { ...(next.media[bp] ?? {}), ...styles };
      }
    }

    this.dirty.set(selector, next);
    if (!this.applyingHistory) this.pushHistory(selector, before, cloneContent(next));
    // A newly-edited element gains an "edited" badge in the layers tree.
    if (!wasTracked) this.layers?.refresh();
  }

  // --- Undo / redo (session-scoped, over committed content operations) ---

  private pushHistory(selector: string, before: ElementContent, after: ElementContent): void {
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    this.undoStack.push({ selector, before, after });
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  }

  private undo(): void {
    const step = this.undoStack.pop();
    if (!step) { this.toast("Nothing to undo", false); return; }
    this.redoStack.push(step);
    this.applyHistory(step.selector, step.before, step.after);
    this.toast("Undo");
  }

  private redo(): void {
    const step = this.redoStack.pop();
    if (!step) { this.toast("Nothing to redo", false); return; }
    this.undoStack.push(step);
    this.applyHistory(step.selector, step.after, step.before);
    this.toast("Redo");
  }

  // Revert an element to `target`, using `previous` to know which attrs/styles
  // to clear (present before, absent now), then persist the reverted state.
  private applyHistory(selector: string, target: ElementContent, previous: ElementContent): void {
    this.applyingHistory = true;
    try {
      this.deselect();
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        this.renderContentDiff(el, target, previous);
        // Clear every style prop the previous state set (base + all buckets) so
        // stale inline values can't survive; refreshPreview re-applies target.
        for (const prop of allStyleProps(previous)) el.style.removeProperty(prop);
      }

      if (isEmptyContent(target)) {
        this.dirty.delete(selector);
        this.committed.delete(selector);
        void this.api.removeOverride(selector).catch(() => {});
        this.setStatus("Draft saved");
      } else {
        this.dirty.set(selector, cloneContent(target));
        this.scheduleSave();
      }
      this.refreshPreview(selector); // apply target's effective styles for active bp
    } finally {
      this.applyingHistory = false;
    }
  }

  // Apply `target`'s content/attrs to the live element (styles are handled by
  // refreshPreview). Attrs in `previous` but gone in `target` are removed.
  private renderContentDiff(el: HTMLElement, target: ElementContent, previous: ElementContent): void {
    if (typeof target.html === "string") el.innerHTML = sanitizeHTML(target.html);
    else if (typeof target.text === "string") el.textContent = target.text;

    const prevAttrs = previous.attrs ?? {}, nextAttrs = target.attrs ?? {};
    for (const key of Object.keys(prevAttrs)) {
      if (!(key in nextAttrs)) el.removeAttribute(key);
    }
    for (const [key, value] of Object.entries(nextAttrs)) {
      if (value === "") el.removeAttribute(key); else el.setAttribute(key, value);
    }
  }

  // --- Selection lifecycle ---

  private deselect(): void {
    if (this.textActive) {
      this.textActive.blur();
      // onTextBlur fires synchronously on blur() and clears this.textActive
    }
    if (this.selectedEl) {
      this.selectedEl.classList.remove("weblay-selected", "weblay-force-visible");
      this.selectedEl = null;
    }
    this.selectedIsImage = false;
    this.handles.detach();
    this.spacing.detach();
    this.panel.hide();
    this.layers?.markSelected(null);
  }

  private onDocClick = (e: MouseEvent): void => {
    const el = e.target instanceof HTMLElement ? e.target : null;
    if (!el) return;
    if (el.closest("[data-weblay-ui]")) return;     // panel, handles, bar, toolbar
    if (el.closest(".weblay-editable")) return;     // handled by specific listeners
    this.deselect();
  };

  // Single-element hover outline. CSS :hover would light up every ancestor
  // container under the cursor; this highlights only the deepest editable.
  private hovered: HTMLElement | null = null;
  private onHover = (e: Event): void => {
    const t = e.target as HTMLElement | null;
    const ed = t?.closest?.(".weblay-editable") as HTMLElement | null;
    const next = ed && !ed.closest("[data-weblay-ui]") ? ed : null;
    if (next === this.hovered) return;
    this.hovered?.classList.remove("weblay-hover");
    this.hovered = next;
    this.hovered?.classList.add("weblay-hover");
    if (this.layers?.isOpen()) this.layers.markHover(next); // two-way hover: page → tree
  };

  // Keep the floating format toolbar in sync with the caret/selection.
  private onSelectionChange = (): void => {
    if (this.textActive) this.toolbar.syncFromSelection();
  };

  // Global undo/redo. Skipped while typing so the contenteditable field keeps
  // its own native character-level undo; editor undo covers committed actions.
  private onGlobalKeydown = (e: KeyboardEvent): void => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
    if (this.textActive) return; // native undo inside the field
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    e.preventDefault();
    if (e.shiftKey) this.redo(); else this.undo();
  };

  // --- Saving and publishing ---

  private saveTimer: number | undefined;

  private scheduleSave(): void {
    this.setStatus(`${this.dirty.size} unsaved change${this.dirty.size === 1 ? "" : "s"}…`);
    this.updatePublishBadge();
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.flush(), 600);
  }

  private async flush(): Promise<void> {
    if (this.saving || this.dirty.size === 0) return;
    this.saving = true;
    const batch = new Map(this.dirty);
    this.dirty.clear();
    this.progress?.busy("Saving…");
    try {
      let conflicts = 0;
      for (const [selector, content] of batch) {
        const meta = this.descriptors.get(selector);
        try {
          await this.api.saveDraft(selector, content, meta?.descriptor, meta?.risk);
          this.committed.set(selector, content);
        } catch (err) {
          if (err instanceof ConflictError) {
            await this.resolveConflict(selector);
            conflicts++;
            continue; // never silently clobber a concurrent edit
          }
          throw err;
        }
      }
      this.unpublished += batch.size - conflicts;
      if (conflicts > 0) {
        this.setStatus("Reloaded a newer edit");
        this.progress?.ok("Reloaded");
      } else if (this.dirty.size === 0) {
        this.setStatus("Draft saved");
        this.progress?.ok("Saved");
      } else {
        this.progress?.busy("Saving…"); // more edits queued; keep the spinner
      }
    } catch (err) {
      for (const [k, v] of batch) if (!this.dirty.has(k)) this.dirty.set(k, v);
      this.toast(`Save failed: ${(err as Error).message}`, true);
      this.setStatus("Save failed — changes kept locally");
      this.progress?.err("Save failed");
    } finally {
      this.saving = false;
      this.updatePublishBadge();
    }
  }

  // resolveConflict handles a concurrent edit: it reloads the server's current
  // draft for the selector, applies it, and tells the editor whose version won,
  // so no one's change is silently lost.
  private async resolveConflict(selector: string): Promise<void> {
    try {
      const fresh = await this.api.drafts();
      const winning = fresh.elements[selector];
      if (winning) {
        this.committed.set(selector, winning);
        applyContent(selector, winning);
      } else {
        this.committed.delete(selector);
      }
      this.dirty.delete(selector); // drop the local change that lost the race
    } catch {
      // If the reload fails, keep the local edit queued so nothing is lost.
      return;
    }
    this.toast(`"${selector}" was edited by someone else — loaded their version`, true);
  }

  // Explicit "Save draft" — flush pending edits immediately (drafts are already
  // autosaved, but this gives a clear, on-demand checkpoint + confirmation).
  private async saveDraftNow(): Promise<void> {
    if (this.textActive) this.textActive.blur();
    clearTimeout(this.saveTimer);
    if (this.dirty.size === 0 && this.unpublished === 0) {
      this.progress.ok("Nothing to save");
      this.toast("Nothing to save", false);
      return;
    }
    const had = this.dirty.size;
    await this.flush();
    if (this.dirty.size === 0) {
      if (had === 0) this.progress.ok("Draft is up to date"); // flush was a no-op
      this.toast(had > 0 ? "Draft saved" : "Draft is up to date", "success");
    }
  }

  // Discard unpublished changes — revert drafts to the published state on the
  // server, then reload so the editor reflects live content. Confirmed first.
  private async discardDraft(): Promise<void> {
    if (this.textActive) this.textActive.blur();
    clearTimeout(this.saveTimer);
    const ok = await this.confirmDialog(
      "Discard unpublished changes?",
      "This reverts the page to its last published version. Your unpublished draft edits will be lost. Published content stays live.",
      "Discard changes",
    );
    if (!ok) return;
    this.setStatus("Discarding…");
    this.progress.busy("Discarding…");
    try {
      this.dirty.clear();
      await this.api.discard();
      this.undoStack = [];
      this.redoStack = [];
      this.progress.ok("Draft discarded");
      this.toast("Draft discarded — reverting to published", "success");
      setTimeout(() => (window.top ?? window).location.reload(), 700);
    } catch (err) {
      this.progress.err("Discard failed");
      this.toast(`Discard failed: ${(err as Error).message}`, true);
      this.setStatus("Discard failed");
    }
  }

  private confirmReset(title: string, body: string): Promise<boolean> {
    return this.confirmDialog(title, body, "Reset to original");
  }

  // Minimal inline confirm dialog rendered in the top document (above the stage).
  private confirmDialog(title: string, body: string, confirmLabel: string): Promise<boolean> {
    return new Promise((resolve) => {
      const doc = this.topDoc();
      const host = doc.createElement("div");
      host.setAttribute("data-weblay-ui", "");
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `
        <style>
          :host { all: initial; }
          .scrim { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,.55);
            display: flex; align-items: center; justify-content: center;
            font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          .box { width: 360px; max-width: 90vw; background: #0b0d17; color: #e5e7eb;
            border: 1px solid #272a3a; border-radius: 14px; padding: 22px; box-shadow: 0 20px 60px rgba(0,0,0,.6); }
          h3 { margin: 0 0 8px; font-size: 16px; }
          p { margin: 0 0 18px; color: #9ca3af; font-size: 13px; line-height: 1.5; }
          .row { display: flex; gap: 10px; justify-content: flex-end; }
          button { font: inherit; border: 0; border-radius: 9px; padding: 9px 16px; cursor: pointer; }
          .cancel { background: #1f2333; color: #d1d5db; }
          .cancel:hover { background: #2a2f45; }
          .confirm { background: #dc2626; color: #fff; font-weight: 600; }
          .confirm:hover { background: #ef4444; }
        </style>
        <div class="scrim">
          <div class="box" role="dialog" aria-modal="true">
            <h3>${escapeHTML(title)}</h3>
            <p>${escapeHTML(body)}</p>
            <div class="row">
              <button class="cancel" id="c">Cancel</button>
              <button class="confirm" id="k">${escapeHTML(confirmLabel)}</button>
            </div>
          </div>
        </div>`;
      const done = (v: boolean) => { host.remove(); resolve(v); };
      shadow.getElementById("c")!.addEventListener("click", () => done(false));
      shadow.getElementById("k")!.addEventListener("click", () => done(true));
      shadow.querySelector(".scrim")!.addEventListener("click", (e) => { if (e.target === e.currentTarget) done(false); });
      doc.body.appendChild(host);
    });
  }

  private async publish(): Promise<void> {
    if (this.textActive) this.textActive.blur();
    await this.flush();
    if (this.dirty.size > 0) {
      this.toast("Fix the failed save before publishing", true);
      return;
    }
    this.setStatus("Publishing…");
    this.progress.busy("Publishing…");
    try {
      const { version } = await this.api.publish();
      this.publishedVersion = version; // keep Versions "Live" marker current
      this.unpublished = 0;
      this.updatePublishBadge();
      this.setStatus("Published · up to date");
      this.progress.ok(`Published v${version}`);
      this.toast(`Published — version ${version} is now live`, "success");
    } catch (err) {
      this.progress.err("Publish failed");
      this.toast(`Publish failed: ${(err as Error).message}`, true);
      this.setStatus("Publish failed");
    }
  }

  private setPeekButton(on: boolean): void {
    this.peekBtn?.classList.toggle("on", on);
  }

  // Make room for the 320px layers panel. When framed, pad the stage container
  // (in the top window) so the device stage centers in the remaining space and
  // the panel sits beside it — using the otherwise-empty backdrop area. When not
  // framed, shift the page body instead.
  private shiftStageForLayers(open: boolean): void {
    const frame = window.frameElement as HTMLElement | null;
    const holder = frame?.parentElement as HTMLElement | null;
    if (holder) {
      holder.style.paddingLeft = open ? "320px" : "";
      return;
    }
    document.documentElement.classList.toggle("weblay-layers-open", open);
  }

  // Highlight the element hovered in the layers panel.
  private setLayerHover(el: HTMLElement | null): void {
    if (el === this.layerHover) return;
    this.layerHover?.classList.remove("weblay-layer-hover");
    this.layerHover = el;
    this.layerHover?.classList.add("weblay-layer-hover");
  }

  // Show a count of saved-but-unpublished changes on the Publish button, so it's
  // clear there's draft work waiting to go live.
  private updatePublishBadge(): void {
    if (!this.pubCount) return;
    const n = this.unpublished + this.dirty.size;
    this.pubCount.textContent = n > 0 ? ` ${n}` : "";
  }

  // --- Version history ---

  private async openVersions(): Promise<void> {
    if (this.textActive) this.textActive.blur();
    const drawer = new VersionsDrawer(this.topDoc(), {
      list: () => this.progress.track("Loading versions…", "Versions loaded", () => this.api.revisions()),
      liveVersion: () => this.publishedVersion,
      onView: (rev) => this.viewVersion(rev),
      onRestoreDraft: (rev) => this.restoreAsDraft(rev),
    });
    await drawer.open();
  }

  // Open a past version read-only: stash its id and reload the stage into the
  // read-only viewer (see viewer.ts / index.ts).
  private viewVersion(rev: Revision): void {
    this.progress.busy(`Opening version ${rev.version}…`);
    sessionStorage.setItem("weblay:view", rev.id);
    (window.top ?? window).location.reload();
  }

  // Copy a revision into the current drafts on the server, then reload so the
  // editor shows the restored content as unpublished draft work.
  private async restoreAsDraft(rev: Revision): Promise<void> {
    this.progress.busy(`Restoring version ${rev.version}…`);
    try {
      await this.api.restoreDraft(rev.id);
    } catch (err) {
      this.progress.err("Restore failed");
      this.toast(`Restore failed: ${(err as Error).message}`, true);
      return;
    }
    this.progress.ok(`Restored v${rev.version} as draft`);
    this.toast(`Version ${rev.version} restored as draft`, "success");
    setTimeout(() => (window.top ?? window).location.reload(), 700);
  }

  private exit(): void {
    sessionStorage.removeItem("weblay:token");
    // Reload the top window so the stage host is torn down, not just the iframe.
    (window.top ?? window).location.reload();
  }

  // --- UI (Shadow DOM) ---

  private injectStyles(): void {
    const style = document.createElement("style");
    style.setAttribute("data-weblay-ui", "");
    style.textContent = `
      .weblay-editable {
        outline: 1.5px dashed rgba(99,102,241,0);
        outline-offset: 2px; transition: outline-color .15s; cursor: pointer;
      }
      .weblay-hover { outline-color: rgba(99,102,241,.8) !important; }
      .weblay-box.weblay-hover { outline-color: rgba(45,212,191,.85) !important; outline-style: dashed; }
      .weblay-editing { outline: 2px solid rgb(99,102,241) !important; cursor: text; }
      .weblay-selected { outline: 2px solid #6366f1 !important; outline-offset: 2px; }
      .weblay-box.weblay-selected { outline-color: #2dd4bf !important; }
      .weblay-img.weblay-hover { filter: brightness(.85); }
      .weblay-rebind-hover { outline: 2px dashed #a78bfa !important; outline-offset: 2px; cursor: crosshair !important; }
      .weblay-layer-hover { outline: 2px solid #818cf8 !important; outline-offset: 1px; }
      /* Pro workspace: shift the page right so the 300px layers panel doesn't cover it. */
      html.weblay-layers-open body { margin-left: 320px !important; transition: margin-left .2s ease; }
      /* Reveal-hidden: force display:none / hidden elements visible so they're selectable. */
      html.weblay-reveal-hidden [hidden],
      html.weblay-reveal-hidden [style*="display: none"],
      html.weblay-reveal-hidden [style*="display:none"] { display: revert !important; }
      .weblay-force-visible { display: revert !important; visibility: visible !important; opacity: 1 !important; }
      ${window.frameElement ? "" : "body { margin-bottom: 64px !important; }"}
    `;
    document.head.appendChild(style);
  }

  private buildBar(): void {
    // Render the bar into the TOP window (when running inside the stage iframe)
    // so it spans the full browser width and sits in the reserved strip below
    // the stage — never overlaying page content. Falls back to the local
    // document when not framed.
    const doc = this.topDoc();
    const host = doc.createElement("div");
    host.setAttribute("data-weblay-ui", "");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        /* 3-column grid keeps the centered device controls dead-centre and stops
           dynamic status/badge text from nudging other controls around. */
        .bar {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647;
          height: ${BAR_H}px; display: grid; grid-template-columns: 1fr auto 1fr;
          align-items: center; gap: 14px; padding: 0 14px;
          background: #0b0d17; color: #e5e7eb; border-top: 1px solid #272a3a;
          font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .grp { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .grp:first-child { justify-self: start; }
        .center { justify-self: center; }
        .right { justify-self: end; }
        .brand { display: inline-flex; align-items: center; gap: 7px; font-weight: 650; color: #e5e7eb; flex: 0 0 auto; }
        .brand .mk { width: 18px; height: 18px; color: #818cf8; }
        .who { color: #6b7280; font-size: 12px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* Segmented control (tool groups + device switcher) */
        .seg { display: inline-flex; align-items: center; background: #14162099; border: 1px solid #23263a;
          border-radius: 10px; padding: 3px; gap: 2px; flex: 0 0 auto; }
        .ico { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 30px;
          border: 0; border-radius: 7px; background: none; color: #9ca3af; cursor: pointer; transition: background .12s, color .12s; }
        .ico:hover { background: #22263a; color: #e5e7eb; }
        .ico:disabled { opacity: .4; cursor: default; }
        .ico svg { width: 16px; height: 16px; }
        .ico.on { background: #312e81; color: #c7d2fe; }
        .ico.warn.on { background: #422006; color: #fcd34d; }

        .dev { display: flex; align-items: center; gap: 6px; padding: 6px 11px; border: 0; border-radius: 7px;
          background: none; color: #9ca3af; cursor: pointer; font: 12.5px -apple-system, sans-serif; transition: background .12s, color .12s; }
        .dev:hover { background: #22263a; color: #e5e7eb; }
        .dev.on { background: #312e81; color: #c7d2fe; }
        .dev svg { width: 15px; height: 15px; }
        .dev .lbl { font-weight: 600; }

        .wbox { display: inline-flex; align-items: center; gap: 3px; flex: 0 0 auto;
          background: #141620; border: 1px solid #23263a; border-radius: 10px; padding: 3px 6px 3px 9px; }
        .wbox .wlab { color: #6b7280; font-size: 11px; font-weight: 600; }
        .wbox input { all: unset; width: 44px; text-align: center; color: #e5e7eb;
          font: 12.5px ui-monospace, SFMono-Regular, Menlo, monospace; -moz-appearance: textfield; }
        .wbox input::-webkit-outer-spin-button, .wbox input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .wbox .wunit { color: #6b7280; font-size: 11px; padding-right: 3px; }
        .wstep { width: 22px; height: 24px; border: 0; background: #22263a; color: #9ca3af; cursor: pointer;
          border-radius: 6px; font-size: 14px; line-height: 1; }
        .wstep:hover { background: #2a2f45; color: #e5e7eb; }

        .sep { width: 1px; height: 22px; background: #23263a; flex: 0 0 auto; }
        .status { color: #9ca3af; font-size: 12px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .btn { display: inline-flex; align-items: center; gap: 6px; font: inherit; border: 0; border-radius: 9px;
          padding: 8px 15px; cursor: pointer; transition: background .12s, color .12s; }
        .btn:disabled { opacity: .5; cursor: default; }
        .btn svg { width: 15px; height: 15px; }
        .btn.ghost { background: #1c1f2e; color: #cbd2e0; }
        .btn.ghost:hover:not(:disabled) { background: #262a3d; color: #fff; }
        .btn.primary { background: #6366f1; color: #fff; font-weight: 600; box-shadow: 0 2px 10px rgba(99,102,241,.35);
          min-width: 96px; justify-content: center; }
        .btn.primary:hover:not(:disabled) { background: #818cf8; }
        .btn.primary .cnt { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px;
          padding: 0 5px; border-radius: 999px; background: rgba(255,255,255,.22); font-size: 11px; font-weight: 700; }
        .btn.primary .cnt:empty { display: none; }

        /* Overflow menu */
        .more-wrap { position: relative; }
        .menu { position: absolute; right: 0; bottom: calc(100% + 8px); min-width: 200px;
          background: #12141f; border: 1px solid #2a2f45; border-radius: 12px; padding: 6px;
          box-shadow: 0 16px 44px rgba(0,0,0,.6); display: flex; flex-direction: column; gap: 1px; }
        .menu[hidden] { display: none; }
        .mi { display: flex; align-items: center; gap: 10px; padding: 9px 11px; border: 0; border-radius: 8px;
          background: none; color: #d1d5db; cursor: pointer; font: 13px -apple-system, sans-serif; text-align: left; }
        .mi:hover { background: #1f2333; color: #fff; }
        .mi svg { width: 15px; height: 15px; color: #9ca3af; flex: 0 0 auto; }
        .mi.danger { color: #fca5a5; }
        .mi.danger:hover { background: #3a1d1d; color: #fecaca; }
        .mi.danger svg { color: #fca5a5; }
        .msep { height: 1px; background: #23263a; margin: 4px 6px; }
        .mi kbd { margin-left: auto; font: 11px ui-monospace, monospace; color: #6b7280; }

        .toast {
          position: fixed; bottom: ${BAR_H + 18}px; left: 50%; transform: translateX(-50%) translateY(8px);
          display: inline-flex; align-items: center; gap: 9px;
          background: #16a34a; color: #fff; padding: 11px 22px; border-radius: 11px;
          font: 13.5px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-weight: 500;
          box-shadow: 0 10px 30px rgba(0,0,0,.45);
          opacity: 0; transition: opacity .22s, transform .22s; pointer-events: none; max-width: 80vw;
        }
        .toast .tic { display: none; width: 18px; height: 18px; flex: 0 0 auto; }
        .toast.success { background: #16a34a; }
        .toast.success .tic { display: inline-flex; }
        .toast.error { background: #dc2626; }
        .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

        @media (max-width: 900px) {
          .who, .status { display: none; }
          .dev .lbl { display: none; }
          .dev { padding: 6px 8px; }
          .btn.ghost .t { display: none; }
          .btn.ghost { padding: 8px 11px; }
        }
        @media (max-width: 640px) {
          .bar { gap: 8px; padding: 0 8px; }
          .wbox { display: none; }
        }
      </style>
      <div class="bar">
        <div class="grp">
          <span class="brand" title="${escapeHTML(this.editorName)} · click text or image to edit · ⌘-click a link to follow it">
            <svg class="mk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16.86 4.49 1.69-1.69a1.88 1.88 0 1 1 2.65 2.65L10.58 16.07a4.5 4.5 0 0 1-1.9 1.13L6 18l.8-2.68a4.5 4.5 0 0 1 1.13-1.9z"/></svg>
            Weblay
          </span>
          <span class="who">Editing as ${escapeHTML(this.editorName)}</span>
        </div>

        <div class="grp center">
          <div class="seg" role="group" aria-label="View tools">
            <button class="ico" id="layers" title="Layers — select any element, incl. hidden">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>
            </button>
            <button class="ico warn" id="peek" title="Peek original — hold to preview, double-click to keep">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
          <div class="seg" id="devices" role="group" aria-label="Preview size">
            ${PRESETS.map((b) => `
              <button class="dev${b.id === "desktop" ? " on" : ""}" data-preset="${b.id}" data-pw="${b.previewWidth}" data-mw="${b.maxWidth}" title="${b.label}${b.previewWidth ? ` — ${b.previewWidth}px` : ""}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${b.icon}</svg>
                <span class="lbl">${b.label}</span>
              </button>`).join("")}
          </div>
          <div class="wbox" title="Custom width — styles you set apply at this width and below">
            <span class="wlab">W</span>
            <button class="wstep" id="wdn" title="Narrower">−</button>
            <input id="wval" type="number" min="240" max="3840" step="10" value="" placeholder="Full" />
            <button class="wstep" id="wup" title="Wider">+</button>
            <span class="wunit">px</span>
          </div>
        </div>

        <div class="grp right">
          <span class="status" id="status"></span>
          <button class="btn ghost" id="savedraft" title="Save draft now">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
            <span class="t">Save</span>
          </button>
          <button class="btn primary" id="publish">Publish<span class="cnt" id="pubcnt"></span></button>
          <div class="more-wrap">
            <button class="ico" id="more" title="More" aria-haspopup="menu" aria-expanded="false">
              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
            </button>
            <div class="menu" id="moremenu" role="menu" hidden>
              <button class="mi" id="versions" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>
                Version history
              </button>
              <button class="mi danger" id="discard" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>
                Discard changes
              </button>
              <div class="msep"></div>
              <button class="mi" id="exit" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>
                Exit editor
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="toast" id="toast">
        <svg class="tic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        <span class="tmsg"></span>
      </div>
    `;
    shadow.getElementById("publish")!.addEventListener("click", () => void this.publish());
    shadow.getElementById("savedraft")!.addEventListener("click", () => void this.saveDraftNow());
    this.pubCount = shadow.getElementById("pubcnt")!;

    // Overflow menu (Versions · Discard · Exit) — opens upward, closes on outside click.
    const moreBtn = shadow.getElementById("more")!;
    const menu = shadow.getElementById("moremenu")!;
    const closeMenu = () => { menu.hidden = true; moreBtn.setAttribute("aria-expanded", "false"); };
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      moreBtn.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
    });
    shadow.getElementById("versions")!.addEventListener("click", () => { closeMenu(); void this.openVersions(); });
    shadow.getElementById("discard")!.addEventListener("click", () => { closeMenu(); void this.discardDraft(); });
    shadow.getElementById("exit")!.addEventListener("click", () => { closeMenu(); this.exit(); });
    doc.addEventListener("click", closeMenu);
    doc.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

    this.layersBtn = shadow.getElementById("layers")!;
    this.layersBtn.addEventListener("click", () => {
      const open = this.layers.toggle();
      this.layersBtn.classList.toggle("on", open);
      this.shiftStageForLayers(open);
      if (open) this.layers.markSelected(this.selectedEl);
    });

    // Peek: press-and-hold shows the original; releasing restores the edits.
    // Double-click makes it sticky (stays on until clicked again).
    this.peekBtn = shadow.getElementById("peek")!;
    this.peekBtn.addEventListener("mousedown", () => this.togglePeek(true));
    this.peekBtn.addEventListener("mouseup", () => { if (!this.peekSticky) this.togglePeek(false); });
    this.peekBtn.addEventListener("mouseleave", () => { if (!this.peekSticky) this.togglePeek(false); });
    this.peekBtn.addEventListener("dblclick", () => {
      this.peekSticky = !this.peekSticky;
      this.togglePeek(this.peekSticky);
    });

    const devices = shadow.getElementById("devices")!;
    const wval = shadow.getElementById("wval") as HTMLInputElement;
    this.markPreset = (id) => {
      for (const d of Array.from(devices.querySelectorAll<HTMLElement>(".dev"))) {
        d.classList.toggle("on", d.dataset.preset === id);
      }
    };
    for (const btn of Array.from(devices.querySelectorAll<HTMLElement>(".dev"))) {
      btn.addEventListener("click", () => {
        const pw = Number(btn.dataset.pw), mw = Number(btn.dataset.mw);
        this.markPreset(btn.dataset.preset!);
        wval.value = pw > 0 ? String(pw) : "";
        this.setPreview(pw > 0 ? pw : Infinity, mw);
      });
    }
    // Custom width: advanced users type any px; edits apply at that width and
    // below. Typing marks no preset as active.
    const applyCustom = () => {
      const raw = parseInt(wval.value, 10);
      if (!Number.isFinite(raw) || raw <= 0) { this.markPreset("desktop"); wval.value = ""; this.setPreview(Infinity, 0); return; }
      const w = Math.min(3840, Math.max(240, raw));
      wval.value = String(w);
      this.markPreset(this.presetFor(w));
      this.setPreview(w, w);
    };
    wval.addEventListener("change", applyCustom);
    wval.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyCustom(); (e.target as HTMLInputElement).blur(); } });
    const nudge = (delta: number) => {
      const cur = parseInt(wval.value, 10) || 1280;
      wval.value = String(Math.min(3840, Math.max(240, cur + delta)));
      applyCustom();
    };
    shadow.getElementById("wdn")!.addEventListener("click", () => nudge(-10));
    shadow.getElementById("wup")!.addEventListener("click", () => nudge(10));

    this.status = shadow.getElementById("status")!;
    this.toastEl = shadow.getElementById("toast")!;
    doc.body.appendChild(host);
  }

  // The document the chrome bar lives in: the top window when we're inside the
  // same-origin stage iframe, else this document.
  private topDoc(): Document {
    try {
      if (window.frameElement && window.top && window.top.document) return window.top.document;
    } catch { /* cross-origin top: fall through */ }
    return document;
  }

  private markPreset: (id: string) => void = () => {};

  // Which preset (if any) a custom width happens to match.
  private presetFor(width: number): string {
    const hit = PRESETS.find((p) => p.previewWidth === width);
    return hit ? hit.id : "";
  }

  // --- Responsive preview ---

  // Set the preview width (what the stage shows) and the media threshold that
  // style edits target. previewW drives which buckets are visible; activeMax is
  // the bucket edits write to.
  private setPreview(previewW: number, activeMax: number): void {
    this.deselect(); // overlay positions would be stale after the width change
    this.previewW = previewW;
    this.activeMax = activeMax;
    this.applyPreviewWidth(previewW);
    this.refreshPreview();
    this.setStatus(
      previewW === Infinity ? "Desktop view"
        : `${previewW}px${activeMax > 0 ? ` · editing ≤ ${activeMax}px` : ""}`,
    );
  }

  // Resize the device stage to the target width. When running inside the stage
  // iframe (the normal case), we resize our own frameElement — the iframe is a
  // real viewport, so the site's layout, vw units, position:fixed and its own
  // @media rules all reflow correctly, exactly like a real device.
  private applyPreviewWidth(width: number): void {
    const frame = window.frameElement as HTMLElement | null;
    if (frame) {
      frame.style.width = width === Infinity ? "100%" : `${width}px`;
      frame.classList.toggle("framed", width !== Infinity);
      return;
    }
    // Fallback (editor running without the stage host): constrain <body>. This
    // previews our own overrides but not the site's viewport-based CSS.
    const id = "weblay-preview-frame";
    let style = document.getElementById(id) as HTMLStyleElement | null;
    if (width === Infinity) { style?.remove(); document.documentElement.classList.remove("weblay-previewing"); return; }
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      style.setAttribute("data-weblay-ui", "");
      document.head.appendChild(style);
    }
    document.documentElement.classList.add("weblay-previewing");
    style.textContent = `
      html.weblay-previewing { background: #0b0d17 !important; }
      html.weblay-previewing body {
        width: ${width}px !important; max-width: ${width}px !important;
        margin-left: auto !important; margin-right: auto !important;
        min-height: 80vh; box-shadow: 0 0 0 1px #272a3a, 0 24px 60px rgba(0,0,0,.6);
        transition: width .28s ease, max-width .28s ease;
      }`;
  }

  private setStatus(text: string): void {
    this.status.textContent = text;
  }

  private toastTimer: number | undefined;

  // kind: false = plain, true = error (red), "success" = green with a check.
  private toast(text: string, kind: boolean | "success" = false): void {
    const msg = this.toastEl.querySelector(".tmsg") ?? this.toastEl;
    msg.textContent = text;
    const variant = kind === "success" ? " success" : kind ? " error" : "";
    this.toastEl.className = `toast show${variant}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.className = "toast";
    }, kind === "success" ? 4200 : 3500);
  }
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// The element under a pointer event, excluding editor chrome.
function pickTarget(t: EventTarget | null): HTMLElement | null {
  const el = t instanceof HTMLElement ? t : null;
  if (!el || el.closest("[data-weblay-ui]")) return null;
  return el;
}
