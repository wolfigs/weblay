// Full-screen "pro workspace": a layers / DOM-tree panel that lets an editor
// select ANY element — including ones the inline editor can't reach because
// they're hidden (carousel slides, modals, hover menus, inactive tabs).
//
// Collapsible tree, live filter, "edited/hidden only" toggles, and two-way sync
// with the page (selecting on the page scrolls + highlights the tree, and vice
// versa). Lives in its own Shadow DOM in the page document.

export interface LayersHandlers {
  onSelect: (el: HTMLElement) => void;
  onHover: (el: HTMLElement | null) => void;
  onClose?: () => void;                    // panel closed itself (e.g. its ✕)
  overrideSelectors: () => Set<string>;   // selectors that currently have overrides
  selectorFor: (el: HTMLElement) => string;
}

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "BR", "LINK", "META", "HEAD"]);
const MAX_NODES = 1500;
const AUTO_EXPAND_DEPTH = 2;

export class LayersPanel {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private treeEl!: HTMLElement;
  private filterEl!: HTMLInputElement;
  private countEl!: HTMLElement;
  private open = false;
  private revealHidden = false;
  private editedOnly = false;
  private filter = "";
  private seeded = false;
  private expanded = new Set<HTMLElement>();
  private rowMap = new WeakMap<HTMLElement, HTMLElement>();
  private selectedEl: HTMLElement | null = null;

  // hostDoc: where the panel renders (top window, so it can use the space beside
  // a narrow device stage). pageDoc: the document whose elements it lists/selects.
  constructor(hostDoc: Document, private pageDoc: Document, private handlers: LayersHandlers) {
    this.host = hostDoc.createElement("div");
    this.host.setAttribute("data-weblay-ui", "");
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.build();
    hostDoc.body.appendChild(this.host);
  }

  private view(): Window { return this.pageDoc.defaultView ?? window; }

  destroy(): void { this.host.remove(); }

  toggle(): boolean {
    this.open = !this.open;
    this.host.style.display = this.open ? "block" : "none";
    if (this.open) { this.render(); if (this.selectedEl) this.markSelected(this.selectedEl); }
    return this.open;
  }

  isOpen(): boolean { return this.open; }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.host.style.display = "none";
    this.handlers.onClose?.();
  }

  // Re-render if open (e.g. after an override is added or reset).
  refresh(): void { if (this.open) this.render(); }

  // Reflect the current editor selection: expand ancestors, highlight, scroll.
  markSelected(el: HTMLElement | null): void {
    this.selectedEl = el;
    if (!this.open) return;
    if (el) {
      let p = el.parentElement;
      while (p && p !== this.pageDoc.body) { this.expanded.add(p); p = p.parentElement; }
      this.render();
    }
    for (const r of Array.from(this.shadow.querySelectorAll(".ln.sel"))) r.classList.remove("sel");
    if (!el) return;
    const row = this.rowMap.get(el);
    if (row) { row.classList.add("sel"); row.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }

  // Highlight (not select) the row for a page-hovered element.
  markHover(el: HTMLElement | null): void {
    if (!this.open) return;
    for (const r of Array.from(this.shadow.querySelectorAll(".ln.hov"))) r.classList.remove("hov");
    if (el) this.rowMap.get(el)?.classList.add("hov");
  }

  private build(): void {
    this.shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .wrap { position: fixed; top: 0; left: 0; bottom: 0; width: 320px; z-index: 2147483646;
          background: #0b0d17; border-right: 1px solid #272a3a; color: #e5e7eb;
          display: flex; flex-direction: column;
          font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .head { padding: 13px 13px 11px; border-bottom: 1px solid #1a1d2e; display: flex; flex-direction: column; gap: 10px; }
        .title { display: flex; align-items: center; gap: 8px; }
        .title b { font-size: 13px; letter-spacing: .06em; color: #a5b4fc; }
        .title .n { font-size: 12px; color: #6b7280; flex: 1; }
        .title .x { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px;
          border: 0; border-radius: 7px; background: none; color: #6b7280; cursor: pointer; }
        .title .x:hover { background: #1f2333; color: #e5e7eb; }
        .title .x svg { width: 15px; height: 15px; }
        .filter { display: flex; align-items: center; gap: 7px; background: #161824; border: 1px solid #272a3a;
          border-radius: 8px; padding: 7px 10px; }
        .filter:focus-within { border-color: #6366f1; }
        .filter svg { width: 14px; height: 14px; color: #6b7280; flex: 0 0 auto; }
        .filter input { all: unset; flex: 1; color: #e5e7eb; font-size: 13.5px; min-width: 0; }
        .filter input::placeholder { color: #4b5563; }
        .toggles { display: flex; gap: 16px; }
        .tg { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: #9ca3af; cursor: pointer; user-select: none; }
        .tg input { accent-color: #6366f1; margin: 0; }
        .tree { flex: 1; overflow: auto; padding: 6px 0 12px; }
        .ln { display: flex; align-items: center; gap: 5px; padding: 4px 12px 4px 0; cursor: pointer; white-space: nowrap; border-radius: 0; }
        .ln:hover { background: #161824; }
        .ln.hov { background: #161e2e; }
        .ln.sel { background: #312e81; }
        .ln.sel .tag { color: #fff; }
        .caret { width: 15px; height: 15px; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
          color: #6b7280; cursor: pointer; transition: transform .12s; font-size: 10px; }
        .caret.open { transform: rotate(90deg); }
        .caret.leaf { visibility: hidden; }
        .dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; background: transparent; }
        .dot.ov { background: #818cf8; }
        .dot.hid { background: #4b5563; }
        .tag { color: #c7d2fe; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; flex: 0 0 auto; }
        .hint { color: #6b7280; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; }
        .badge { font-size: 10px; padding: 1px 6px; border-radius: 5px; flex: 0 0 auto; }
        .badge.ov { color: #c7d2fe; background: #312e81; }
        .badge.hid { color: #9ca3af; background: #1f2333; }
        .empty { color: #6b7280; padding: 24px 14px; font-size: 13px; text-align: center; }
        mark { background: #6366f1; color: #fff; border-radius: 2px; }
      </style>
      <div class="wrap">
        <div class="head">
          <div class="title"><b>LAYERS</b><span class="n" id="count"></span>
            <button class="x" id="close" title="Close layers"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6 18 18M18 6 6 18"/></svg></button>
          </div>
          <div class="filter">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            <input id="filter" type="text" placeholder="Filter by tag, class, text…" spellcheck="false" />
          </div>
          <div class="toggles">
            <label class="tg"><input type="checkbox" id="edited" /> Edited only</label>
            <label class="tg"><input type="checkbox" id="reveal" /> Show hidden</label>
          </div>
        </div>
        <div class="tree" id="tree"></div>
      </div>`;
    this.treeEl = this.shadow.getElementById("tree")!;
    this.filterEl = this.shadow.getElementById("filter") as HTMLInputElement;
    this.countEl = this.shadow.getElementById("count")!;
    this.host.style.display = "none";

    this.filterEl.addEventListener("input", () => { this.filter = this.filterEl.value.trim().toLowerCase(); this.render(); });
    (this.shadow.getElementById("edited") as HTMLInputElement).addEventListener("change", (e) => {
      this.editedOnly = (e.target as HTMLInputElement).checked; this.render();
    });
    (this.shadow.getElementById("reveal") as HTMLInputElement).addEventListener("change", (e) => {
      this.revealHidden = (e.target as HTMLInputElement).checked;
      this.pageDoc.documentElement.classList.toggle("weblay-reveal-hidden", this.revealHidden);
      this.render();
    });
    this.treeEl.addEventListener("mouseleave", () => this.handlers.onHover(null));
    this.shadow.getElementById("close")!.addEventListener("click", () => this.close());
  }

  private render(): void {
    const overrides = this.handlers.overrideSelectors();
    this.treeEl.innerHTML = "";
    this.rowMap = new WeakMap();

    // Filter/edited mode: compute the set of elements to show (matches + ancestors).
    const filtering = this.filter !== "" || this.editedOnly;
    const visible = filtering ? this.computeVisible(overrides) : null;

    let count = 0;
    const walk = (el: HTMLElement, depth: number): void => {
      if (count >= MAX_NODES) return;
      if (SKIP.has(el.tagName) || el.closest("[data-weblay-ui]")) return;
      if (visible && !visible.has(el)) return;

      const kids = Array.from(el.children).filter((c) => c instanceof HTMLElement && !SKIP.has(c.tagName)) as HTMLElement[];
      const hasKids = kids.length > 0;
      // Seed default expansion once (shallow levels open).
      if (!this.seeded && hasKids && depth < AUTO_EXPAND_DEPTH) this.expanded.add(el);
      const isOpen = filtering || this.expanded.has(el);

      const hidden = this.isHidden(el);
      const editable = el.classList.contains("weblay-editable") || el.tagName === "IMG";
      const sel = editable ? this.safeSelector(el) : "";
      const hasOverride = !!sel && overrides.has(sel);

      count++;
      const row = document.createElement("div");
      row.className = "ln";
      row.style.paddingLeft = `${8 + depth * 13}px`;
      row.innerHTML = `
        <span class="caret ${hasKids ? (isOpen ? "open" : "") : "leaf"}">▶</span>
        <span class="dot ${hasOverride ? "ov" : hidden ? "hid" : ""}"></span>
        <span class="tag">${el.tagName.toLowerCase()}</span>
        <span class="hint">${this.hint(el)}</span>
        ${hasOverride ? `<span class="badge ov">edited</span>` : ""}
        ${hidden ? `<span class="badge hid">hidden</span>` : ""}`;

      const caret = row.querySelector(".caret")!;
      caret.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!hasKids || filtering) return;
        this.expanded.has(el) ? this.expanded.delete(el) : this.expanded.add(el);
        this.render();
      });
      row.addEventListener("click", (e) => { e.stopPropagation(); this.handlers.onSelect(el); });
      row.addEventListener("mouseenter", () => this.handlers.onHover(el));
      this.treeEl.appendChild(row);
      this.rowMap.set(el, row);
      if (el === this.selectedEl) row.classList.add("sel");

      if (isOpen) for (const k of kids) walk(k, depth + 1);
    };

    if (this.pageDoc.body) {
      for (const c of Array.from(this.pageDoc.body.children)) if (c instanceof HTMLElement) walk(c, 0);
    }
    this.seeded = true;
    this.countEl.textContent = count ? `${count}` : "";
    if (count === 0) this.treeEl.innerHTML = `<div class="empty">${filtering ? "No matching elements." : "No elements."}</div>`;
  }

  // Elements to show under filter/edited-only: each match plus its ancestors.
  private computeVisible(overrides: Set<string>): Set<HTMLElement> {
    const vis = new Set<HTMLElement>();
    const all = this.pageDoc.body ? Array.from(this.pageDoc.body.querySelectorAll<HTMLElement>("*")) : [];
    for (const el of all) {
      if (SKIP.has(el.tagName) || el.closest("[data-weblay-ui]")) continue;
      if (!this.matches(el, overrides)) continue;
      let node: HTMLElement | null = el;
      while (node && node !== this.pageDoc.body) { vis.add(node); node = node.parentElement; }
    }
    return vis;
  }

  private matches(el: HTMLElement, overrides: Set<string>): boolean {
    if (this.editedOnly) {
      const sel = (el.classList.contains("weblay-editable") || el.tagName === "IMG") ? this.safeSelector(el) : "";
      if (!sel || !overrides.has(sel)) return false;
    }
    if (this.filter) {
      const hay = `${el.tagName} ${el.id} ${el.className} ${(el.textContent ?? "").slice(0, 80)}`.toLowerCase();
      if (!hay.includes(this.filter)) return false;
    }
    return true;
  }

  private hint(el: HTMLElement): string {
    let h = "";
    if (el.id) h = `#${el.id}`;
    else {
      const cls = Array.from(el.classList).filter((c) => !c.startsWith("weblay-"))[0];
      if (cls) h = `.${cls}`;
      else { const t = (el.textContent ?? "").trim().replace(/\s+/g, " "); if (t) h = `"${t.slice(0, 22)}"`; }
    }
    if (this.filter && h) {
      const i = h.toLowerCase().indexOf(this.filter);
      if (i >= 0) return esc(h.slice(0, i)) + "<mark>" + esc(h.slice(i, i + this.filter.length)) + "</mark>" + esc(h.slice(i + this.filter.length));
    }
    return esc(h);
  }

  private isHidden(el: HTMLElement): boolean {
    if (el.hidden) return true;
    const s = this.view().getComputedStyle(el);
    return s.display === "none" || s.visibility === "hidden" || (el.offsetParent === null && s.position !== "fixed");
  }

  private safeSelector(el: HTMLElement): string {
    try { return this.handlers.selectorFor(el); } catch { return ""; }
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
