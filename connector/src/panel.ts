// Floating property panel — attributes and spacing editor for the selected element.
// Lives in its own Shadow DOM so site styles never bleed in.

import type { ElementContent } from "./types";

interface AttrField {
  key: string;
  label: string;
  inputType?: "text" | "url";
}

const TAG_FIELDS: Record<string, AttrField[]> = {
  A: [
    { key: "href", label: "Link URL", inputType: "url" },
    { key: "title", label: "Tooltip" },
    { key: "target", label: "Target (_blank / _self)" },
    { key: "aria-label", label: "ARIA label" },
  ],
  IMG: [
    { key: "alt", label: "Alt text" },
    { key: "title", label: "Tooltip" },
  ],
  INPUT: [
    { key: "placeholder", label: "Placeholder" },
    { key: "aria-label", label: "ARIA label" },
    { key: "title", label: "Tooltip" },
  ],
  BUTTON: [
    { key: "aria-label", label: "ARIA label" },
    { key: "title", label: "Tooltip" },
  ],
  TEXTAREA: [
    { key: "placeholder", label: "Placeholder" },
    { key: "aria-label", label: "ARIA label" },
  ],
};

const DEFAULT_FIELDS: AttrField[] = [
  { key: "title", label: "Tooltip" },
  { key: "aria-label", label: "ARIA label" },
];

const SPACING_SIDES = ["top", "right", "bottom", "left"] as const;
type SpacingGroup = "padding" | "margin";

export interface PanelHandlers {
  onAttr: (key: string, value: string) => void;
  onStyle: (prop: string, value: string) => void;
  onUpload: (file: File) => void;
}

export class FloatingPanel {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private panel!: HTMLElement;
  private attrsBody!: HTMLElement;
  private spacingBody!: HTMLElement;
  private activeEl: HTMLElement | null = null;

  constructor() {
    this.host = document.createElement("div");
    this.host.setAttribute("data-inlay-ui", "");
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.buildShell();
    document.body.appendChild(this.host);
    window.addEventListener("scroll", this.syncPos, { passive: true });
    window.addEventListener("resize", this.syncPos, { passive: true });
  }

  destroy(): void {
    window.removeEventListener("scroll", this.syncPos);
    window.removeEventListener("resize", this.syncPos);
    this.host.remove();
  }

  show(el: HTMLElement, content: ElementContent, handlers: PanelHandlers, isImage = false): void {
    this.activeEl = el;
    this.renderAttrs(el, content, handlers, isImage);
    this.renderSpacing(el, content, handlers.onStyle);
    this.panel.style.display = "block";
    this.syncPos();
  }

  hide(): void {
    this.panel.style.display = "none";
    this.activeEl = null;
  }

  private buildShell(): void {
    this.shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .panel {
          display: none; position: fixed; width: 296px;
          background: #0b0d17; border: 1px solid #272a3a; border-radius: 12px;
          overflow: hidden; box-shadow: 0 12px 40px rgba(0,0,0,.75);
          z-index: 2147483646;
          font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #e5e7eb;
        }
        .tabs { display: flex; border-bottom: 1px solid #1a1d2e; }
        .tab {
          flex: 1; padding: 10px 0; background: none; border: 0;
          border-bottom: 2px solid transparent; margin-bottom: -1px;
          color: #6b7280; cursor: pointer; font: inherit;
          font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
        }
        .tab.on { color: #a5b4fc; border-bottom-color: #6366f1; }
        .body { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
        .body.off { display: none; }
        .field { display: flex; flex-direction: column; gap: 4px; }
        .field-label { font-size: 11px; color: #9ca3af; font-weight: 500; }
        .field-input {
          background: #161824; border: 1px solid #272a3a; border-radius: 6px;
          color: #e5e7eb; padding: 6px 10px; outline: none; width: 100%; box-sizing: border-box;
          font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .field-input:focus { border-color: #6366f1; }
        .replace-btn {
          background: #161824; border: 1px solid #272a3a; border-radius: 6px;
          color: #9ca3af; padding: 7px 12px; cursor: pointer; text-align: left;
          font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          margin-top: 2px; width: 100%; box-sizing: border-box;
        }
        .replace-btn:hover { background: #1f2333; color: #d1d5db; }
        .spacing-section {
          font-size: 10px; color: #6b7280; font-weight: 700;
          text-transform: uppercase; letter-spacing: .08em;
          padding-bottom: 6px; border-bottom: 1px solid #1a1d2e;
        }
        .bm {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 4px;
          align-items: center;
          justify-items: center;
        }
        .bm-input {
          width: 72px; padding: 5px 4px; text-align: center;
          background: #161824; border: 1px solid #272a3a; border-radius: 6px;
          color: #e5e7eb; outline: none; box-sizing: border-box;
          font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .bm-input:focus { border-color: #6366f1; }
        .bm-label {
          font-size: 9px; color: #374151; font-weight: 600;
          text-transform: uppercase; letter-spacing: .06em;
        }
      </style>
      <div class="panel" id="panel">
        <div class="tabs">
          <button class="tab on" id="tab-a">Attributes</button>
          <button class="tab" id="tab-s">Spacing</button>
        </div>
        <div class="body" id="ab"></div>
        <div class="body off" id="sb"></div>
      </div>
    `;

    this.panel = this.shadow.getElementById("panel")!;
    this.attrsBody = this.shadow.getElementById("ab")!;
    this.spacingBody = this.shadow.getElementById("sb")!;

    const ta = this.shadow.getElementById("tab-a")!;
    const ts = this.shadow.getElementById("tab-s")!;
    ta.addEventListener("click", () => {
      ta.className = "tab on"; ts.className = "tab";
      this.attrsBody.className = "body"; this.spacingBody.className = "body off";
    });
    ts.addEventListener("click", () => {
      ts.className = "tab on"; ta.className = "tab";
      this.spacingBody.className = "body"; this.attrsBody.className = "body off";
    });
  }

  private renderAttrs(
    el: HTMLElement,
    content: ElementContent,
    handlers: PanelHandlers,
    isImage: boolean,
  ): void {
    const fields = TAG_FIELDS[el.tagName] ?? DEFAULT_FIELDS;
    const saved = content.attrs ?? {};
    this.attrsBody.innerHTML = "";

    for (const f of fields) {
      const val = saved[f.key] ?? el.getAttribute(f.key) ?? "";
      const wrapper = document.createElement("div");
      wrapper.className = "field";

      const lbl = document.createElement("span");
      lbl.className = "field-label";
      lbl.textContent = f.label;

      const inp = document.createElement("input");
      inp.className = "field-input";
      inp.type = f.inputType ?? "text";
      inp.value = val;
      inp.placeholder = f.key;
      inp.addEventListener("change", () => {
        const v = inp.value.trim();
        handlers.onAttr(f.key, v);
        if (f.key === "target" && v === "_blank") {
          handlers.onAttr("rel", "noopener noreferrer");
        }
      });
      wrapper.append(lbl, inp);
      this.attrsBody.appendChild(wrapper);
    }

    if (isImage) {
      const btn = document.createElement("button");
      btn.className = "replace-btn";
      btn.textContent = "Replace image…";
      btn.addEventListener("click", () => {
        const fi = document.createElement("input");
        fi.type = "file";
        fi.accept = "image/*";
        fi.onchange = () => {
          if (fi.files?.[0]) handlers.onUpload(fi.files[0]);
        };
        fi.click();
      });
      this.attrsBody.appendChild(btn);
    }
  }

  private renderSpacing(
    el: HTMLElement,
    content: ElementContent,
    onStyle: (prop: string, value: string) => void,
  ): void {
    const computed = window.getComputedStyle(el);
    const saved = content.style ?? {};
    this.spacingBody.innerHTML = "";

    for (const group of ["padding", "margin"] as SpacingGroup[]) {
      const sec = document.createElement("div");
      sec.className = "spacing-section";
      sec.textContent = group === "padding" ? "Padding" : "Margin";
      this.spacingBody.appendChild(sec);

      // 3×3 box-model grid: top at col2/row1, left at col1/row2, right at col3/row2, bottom at col2/row3
      const bm = document.createElement("div");
      bm.className = "bm";

      const positions: Array<{ side: typeof SPACING_SIDES[number]; col: number; row: number }> = [
        { side: "top", col: 2, row: 1 },
        { side: "left", col: 1, row: 2 },
        { side: "right", col: 3, row: 2 },
        { side: "bottom", col: 2, row: 3 },
      ];

      // center label
      const mid = document.createElement("div");
      mid.className = "bm-label";
      mid.style.cssText = "grid-column:2;grid-row:2;";
      mid.textContent = group === "padding" ? "P" : "M";
      bm.appendChild(mid);

      for (const { side, col, row } of positions) {
        const prop = `${group}-${side}`;
        const current = saved[prop] ?? computed.getPropertyValue(prop) ?? "0px";

        const cell = document.createElement("div");
        cell.style.cssText = `grid-column:${col};grid-row:${row};`;

        const inp = document.createElement("input");
        inp.className = "bm-input";
        inp.type = "text";
        inp.value = current;
        inp.title = prop;
        inp.addEventListener("input", () => {
          const raw = inp.value.trim();
          const val = /^\d+(\.\d+)?$/.test(raw) ? raw + "px" : raw;
          if (el instanceof HTMLElement) el.style.setProperty(prop, val);
        });
        inp.addEventListener("change", () => {
          const raw = inp.value.trim();
          const val = /^\d+(\.\d+)?$/.test(raw) ? raw + "px" : raw;
          inp.value = val;
          onStyle(prop, val);
        });
        cell.appendChild(inp);
        bm.appendChild(cell);
      }

      this.spacingBody.appendChild(bm);
    }
  }

  private syncPos = (): void => {
    if (!this.activeEl || this.panel.style.display === "none") return;
    const rect = this.activeEl.getBoundingClientRect();
    const ph = this.panel.offsetHeight || 280;
    const pw = 296;

    let top = rect.top - ph - 10;
    if (top < 8) top = rect.bottom + 10;
    if (top + ph > window.innerHeight - 70) top = Math.max(8, window.innerHeight - ph - 74);

    let left = rect.left;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (left < 8) left = 8;

    this.panel.style.top = `${top}px`;
    this.panel.style.left = `${left}px`;
  };
}
