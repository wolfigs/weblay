// Floating rich-text toolbar. Appears above a text selection inside an element
// that is being edited, offering inline formatting. Lives in its own Shadow DOM.
//
// Formatting uses execCommand — deprecated but still the only dependency-free,
// cross-browser way to toggle inline styles. Whatever markup it produces is
// re-sanitized on save (see sanitize.ts), so the exact tags it emits don't
// matter for security or storage cleanliness.

export interface ToolbarHandlers {
  // Called after the selection's content is mutated so the editor can persist.
  onChange: () => void;
}

interface Btn {
  cmd: string;
  label: string;
  title: string;
  key?: string; // keyboard hint shown in tooltip
}

const BUTTONS: Btn[] = [
  { cmd: "bold", label: "<b>B</b>", title: "Bold", key: "⌘B" },
  { cmd: "italic", label: "<i>I</i>", title: "Italic", key: "⌘I" },
  { cmd: "underline", label: "<u>U</u>", title: "Underline", key: "⌘U" },
  { cmd: "strikeThrough", label: "<s>S</s>", title: "Strikethrough" },
  { cmd: "code", label: "&lt;/&gt;", title: "Inline code" },
  { cmd: "createLink", label: "🔗", title: "Link", key: "⌘K" },
  { cmd: "removeFormat", label: "⌫", title: "Clear formatting" },
];

export class RichToolbar {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private bar!: HTMLElement;
  private linkRow!: HTMLElement;
  private linkInput!: HTMLInputElement;
  private savedRange: Range | null = null;
  private editable: HTMLElement | null = null;

  constructor(private handlers: ToolbarHandlers) {
    this.host = document.createElement("div");
    this.host.setAttribute("data-weblay-ui", "");
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.build();
    document.body.appendChild(this.host);
    // styleWithCSS off → execCommand emits <b>/<i> tags, not inline styles.
    try { document.execCommand("styleWithCSS", false, "false"); } catch { /* ignore */ }
  }

  destroy(): void { this.host.remove(); }

  // The element currently in rich-edit mode; used to scope the toolbar.
  setEditable(el: HTMLElement | null): void { this.editable = el; }

  private build(): void {
    this.shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .bar {
          display: none; position: fixed; z-index: 2147483647;
          background: #0b0d17; border: 1px solid #272a3a; border-radius: 10px;
          box-shadow: 0 10px 30px rgba(0,0,0,.6); padding: 4px;
          font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .row { display: flex; align-items: center; gap: 2px; }
        .row.link { display: none; padding: 2px; gap: 4px; }
        .row.link.on { display: flex; }
        button {
          all: unset; box-sizing: border-box; cursor: pointer;
          min-width: 30px; height: 30px; padding: 0 8px; border-radius: 7px;
          color: #d1d5db; text-align: center; line-height: 30px;
          font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        button:hover { background: #1f2333; color: #fff; }
        button.on { background: #312e81; color: #c7d2fe; }
        button code, button b, button i, button u, button s { font-style: inherit; }
        .sep { width: 1px; height: 18px; background: #272a3a; margin: 0 3px; }
        .link input {
          all: unset; box-sizing: border-box; width: 200px; height: 28px;
          background: #161824; border: 1px solid #272a3a; border-radius: 6px;
          color: #e5e7eb; padding: 0 9px; font: 12.5px -apple-system, sans-serif;
        }
        .link input:focus { border-color: #6366f1; }
        .link .apply { background: #6366f1; color: #fff; min-width: auto; }
        .link .apply:hover { background: #818cf8; }
      </style>
      <div class="bar" id="bar">
        <div class="row" id="btns"></div>
        <div class="row link" id="linkrow">
          <input id="linkinput" type="url" placeholder="https://…  (empty to remove)" />
          <button class="apply" id="linkapply" title="Apply">Apply</button>
        </div>
      </div>`;

    this.bar = this.shadow.getElementById("bar")!;
    this.linkRow = this.shadow.getElementById("linkrow")!;
    this.linkInput = this.shadow.getElementById("linkinput") as HTMLInputElement;

    const btns = this.shadow.getElementById("btns")!;
    for (const b of BUTTONS) {
      if (b.cmd === "removeFormat") btns.appendChild(this.sep());
      const el = document.createElement("button");
      el.innerHTML = b.label;
      el.title = b.key ? `${b.title} (${b.key})` : b.title;
      el.dataset.cmd = b.cmd;
      // Preserve the page selection — never let the button take focus.
      el.addEventListener("mousedown", (e) => e.preventDefault());
      el.addEventListener("click", (e) => { e.preventDefault(); this.run(b.cmd); });
      btns.appendChild(el);
    }

    this.linkInput.addEventListener("mousedown", (e) => e.stopPropagation());
    this.linkInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); this.applyLink(); }
      else if (e.key === "Escape") { e.preventDefault(); this.closeLinkRow(); }
    });
    this.shadow.getElementById("linkapply")!.addEventListener("mousedown", (e) => e.preventDefault());
    this.shadow.getElementById("linkapply")!.addEventListener("click", (e) => { e.preventDefault(); this.applyLink(); });
  }

  private sep(): HTMLElement {
    const s = document.createElement("span");
    s.className = "sep";
    return s;
  }

  // Public: exec a formatting command by name (also used by keyboard shortcuts).
  run(cmd: string): void {
    if (!this.hasSelectionInEditable()) return;
    if (cmd === "createLink") { this.openLinkRow(); return; }
    if (cmd === "code") { this.toggleCode(); this.after(); return; }
    document.execCommand(cmd);
    this.after();
  }

  private after(): void {
    this.handlers.onChange();
    this.syncStates();
  }

  // Wrap / unwrap the selection in <code>.
  private toggleCode(): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const existing = this.ancestorTag(sel, "CODE");
    if (existing) {
      // Unwrap: replace the <code> with its children.
      const parent = existing.parentNode;
      if (!parent) return;
      while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
      parent.removeChild(existing);
      return;
    }
    if (range.collapsed) return;
    const code = document.createElement("code");
    try {
      code.appendChild(range.extractContents());
      range.insertNode(code);
      // Reselect the wrapped content.
      const r = document.createRange();
      r.selectNodeContents(code);
      sel.removeAllRanges();
      sel.addRange(r);
    } catch { /* cross-boundary selection: ignore */ }
  }

  private openLinkRow(): void {
    this.savedRange = this.currentRange();
    const existing = this.ancestorTag(window.getSelection(), "A") as HTMLAnchorElement | null;
    this.linkInput.value = existing?.getAttribute("href") ?? "";
    this.linkRow.classList.add("on");
    this.linkInput.focus();
    this.linkInput.select();
  }

  private closeLinkRow(): void {
    this.linkRow.classList.remove("on");
    this.savedRange = null;
    this.editable?.focus();
  }

  private applyLink(): void {
    const url = this.linkInput.value.trim();
    this.restoreRange();
    if (!url) {
      document.execCommand("unlink");
    } else if (!/^\s*(javascript|data|vbscript|file):/i.test(url)) {
      document.execCommand("createLink", false, url);
    }
    this.closeLinkRow();
    this.after();
  }

  // --- Selection helpers ---

  private currentRange(): Range | null {
    const sel = window.getSelection();
    return sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  }

  private restoreRange(): void {
    if (!this.savedRange) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(this.savedRange);
  }

  private hasSelectionInEditable(): boolean {
    if (!this.editable) return false;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const node = sel.anchorNode;
    return !!node && this.editable.contains(node);
  }

  private ancestorTag(sel: Selection | null, tag: string): Element | null {
    let node = sel?.anchorNode ?? null;
    while (node && node !== this.editable) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === tag) {
        return node as Element;
      }
      node = node.parentNode;
    }
    return null;
  }

  // --- Visibility / positioning ---

  // Called by the editor on selectionchange. Shows when there's a ranged
  // selection inside the active editable, hides otherwise.
  syncFromSelection(): void {
    const sel = window.getSelection();
    if (!this.editable || !sel || sel.rangeCount === 0 || sel.isCollapsed || !this.hasSelectionInEditable()) {
      if (!this.linkRow.classList.contains("on")) this.hide();
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { this.hide(); return; }
    this.bar.style.display = "block";
    this.position(rect);
    this.syncStates();
  }

  private position(rect: DOMRect): void {
    const bw = this.bar.offsetWidth || 250;
    const bh = this.bar.offsetHeight || 38;
    let top = rect.top - bh - 8;
    if (top < 8) top = rect.bottom + 8;
    let left = rect.left + rect.width / 2 - bw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
    this.bar.style.top = `${top}px`;
    this.bar.style.left = `${left}px`;
  }

  private syncStates(): void {
    const sel = window.getSelection();
    for (const el of Array.from(this.shadow.querySelectorAll<HTMLElement>("#btns button"))) {
      const cmd = el.dataset.cmd!;
      let on = false;
      try {
        if (cmd === "code") on = !!this.ancestorTag(sel, "CODE");
        else if (cmd === "createLink") on = !!this.ancestorTag(sel, "A");
        else if (cmd !== "removeFormat") on = document.queryCommandState(cmd);
      } catch { /* queryCommandState can throw on some cmds */ }
      el.classList.toggle("on", on);
    }
  }

  hide(): void {
    this.bar.style.display = "none";
    this.linkRow.classList.remove("on");
  }

  get visible(): boolean {
    return this.bar.style.display === "block";
  }
}
