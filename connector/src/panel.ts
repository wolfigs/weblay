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
  onTab?: (tab: string) => void;   // active tab changed ("a" | "t" | "s")
  onParent?: () => void;           // select the enclosing element
  onPeek?: (on: boolean) => void;  // press-hold: show this element's original
  onReset?: () => void;            // reset this element to original
  hasOverride?: boolean;           // whether this element currently has an override
}

// Splits "12px" / "1.5rem" / "0" into a number and its unit (defaulting to px).
function parseLength(raw: string): { num: number; unit: string } {
  const m = String(raw).trim().match(/^(-?\d*\.?\d+)\s*([a-z%]*)$/i);
  if (!m) return { num: 0, unit: "px" };
  return { num: parseFloat(m[1]), unit: m[2] || "px" };
}

export class FloatingPanel {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private panel!: HTMLElement;
  private bannerEl!: HTMLElement;
  private riskEl!: HTMLElement;
  private footerBody!: HTMLElement;
  private headerBody!: HTMLElement;
  private attrsBody!: HTMLElement;
  private styleBody!: HTMLElement;
  private spacingBody!: HTMLElement;
  private activeEl: HTMLElement | null = null;
  private handlers: PanelHandlers | null = null;

  constructor() {
    this.host = document.createElement("div");
    this.host.setAttribute("data-weblay-ui", "");
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

  show(
    el: HTMLElement,
    content: ElementContent,
    handlers: PanelHandlers,
    isImage = false,
    bpLabel: string | null = null,
    riskMsg: string | null = null,
  ): void {
    this.activeEl = el;
    this.handlers = handlers;
    this.renderBanner(bpLabel);
    this.renderRisk(riskMsg);
    this.renderHeader(el, handlers, isImage);
    this.renderAttrs(el, content, handlers);
    this.renderStyle(el, content, handlers.onStyle);
    this.renderSpacing(el, content, handlers.onStyle);
    this.renderFooter(handlers);
    this.selectTab("a"); // always open on the Content tab
    this.panel.style.display = "block";
    this.syncPos();
  }

  // When editing a non-desktop breakpoint, show a banner so it's obvious that
  // style/spacing changes only affect that screen size.
  private renderBanner(bpLabel: string | null): void {
    this.bannerEl.innerHTML = bpLabel
      ? `<span class="dot"></span>Editing <b>${bpLabel}</b> · overrides this size &amp; smaller`
      : "";
    this.bannerEl.className = bpLabel ? "bp-banner on" : "bp-banner";
  }

  // Bind-time drift-risk warning (e.g. "item 3 of 12 similar items").
  private renderRisk(msg: string | null): void {
    this.riskEl.textContent = msg ?? "";
    this.riskEl.className = msg ? "risk-banner on" : "risk-banner";
  }

  // Per-element Peek (press-hold to see original) + Reset (revert to original).
  private renderFooter(handlers: PanelHandlers): void {
    this.footerBody.innerHTML = "";
    if (!handlers.onPeek && !handlers.onReset) return;

    if (handlers.onPeek) {
      const peek = document.createElement("button");
      peek.className = "pf-btn";
      peek.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><span>Hold to peek original</span>`;
      peek.title = "Press and hold to see the original";
      peek.addEventListener("mousedown", () => handlers.onPeek!(true));
      peek.addEventListener("mouseup", () => handlers.onPeek!(false));
      peek.addEventListener("mouseleave", () => handlers.onPeek!(false));
      this.footerBody.appendChild(peek);
    }
    if (handlers.onReset && handlers.hasOverride) {
      const reset = document.createElement("button");
      reset.className = "pf-btn danger";
      reset.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/></svg><span>Reset to original</span>`;
      reset.addEventListener("click", () => handlers.onReset!());
      this.footerBody.appendChild(reset);
    }
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
        .bp-banner { display: none; }
        .bp-banner.on {
          display: flex; align-items: center; gap: 7px;
          padding: 8px 14px; background: #2e1065; color: #ddd6fe;
          font-size: 11.5px; border-bottom: 1px solid #3b1e78;
        }
        .bp-banner b { font-weight: 700; color: #fff; }
        .bp-banner .dot { width: 6px; height: 6px; border-radius: 50%; background: #a78bfa; flex: 0 0 auto; }
        .risk-banner { display: none; }
        .risk-banner.on {
          display: block; padding: 8px 14px; background: #2a1e05; color: #fcd34d;
          font-size: 11.5px; line-height: 1.45; border-bottom: 1px solid #4a3410;
        }
        .header { padding: 14px 16px 0; }
        .header:empty { display: none; }
        .el-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
        .el-chip {
          font: 11px ui-monospace, SFMono-Regular, Menlo, monospace;
          color: #a5b4fc; background: #161824; border: 1px solid #272a3a;
          padding: 3px 8px; border-radius: 6px;
        }
        .el-parent {
          display: inline-flex; align-items: center; gap: 5px;
          background: #161824; border: 1px solid #272a3a; border-radius: 6px;
          color: #9ca3af; padding: 4px 9px; cursor: pointer; font: inherit; font-size: 11px;
        }
        .el-parent:hover { background: #1f2333; color: #e5e7eb; }
        .el-parent svg { width: 12px; height: 12px; }
        .choose-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; box-sizing: border-box;
          background: #6366f1; border: 0; border-radius: 9px;
          color: #fff; padding: 11px 14px; cursor: pointer; font: inherit;
          font-weight: 600; font-size: 13px;
          box-shadow: 0 4px 14px rgba(99,102,241,.35);
        }
        .choose-btn:hover { background: #818cf8; }
        .choose-btn svg { width: 15px; height: 15px; }
        .open-btn {
          background: #161824; color: #a5b4fc; border: 1px solid #313552;
          box-shadow: none;
        }
        .open-btn:hover { background: #1f2333; color: #c7d2fe; }
        .tabs { display: flex; border-bottom: 1px solid #1a1d2e; margin-top: 12px; }
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
        .spacing-section {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 10px; color: #6b7280; font-weight: 700;
          text-transform: uppercase; letter-spacing: .08em;
          padding-bottom: 8px; border-bottom: 1px solid #1a1d2e;
        }
        .link-toggle {
          background: none; border: 0; cursor: pointer; padding: 2px 4px;
          color: #4b5563; font: inherit; font-size: 13px; line-height: 1; border-radius: 4px;
          filter: grayscale(1) opacity(.6);
        }
        .link-toggle:hover { filter: grayscale(.4) opacity(.9); }
        .link-toggle.on { filter: none; }
        .bm {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 6px 4px;
          align-items: center;
          justify-items: center;
        }
        .bm-label {
          font-size: 9px; color: #4b5563; font-weight: 700;
          text-transform: uppercase; letter-spacing: .06em;
        }
        .stepper {
          display: inline-flex; align-items: center;
          background: #161824; border: 1px solid #272a3a; border-radius: 7px;
          overflow: hidden; height: 28px;
        }
        .stepper:focus-within { border-color: #6366f1; }
        .step-btn {
          width: 22px; height: 100%; border: 0; background: none; cursor: pointer;
          color: #9ca3af; font: 15px/1 -apple-system, sans-serif; padding: 0;
          display: flex; align-items: center; justify-content: center;
          user-select: none;
        }
        .step-btn:hover { background: #22263a; color: #e5e7eb; }
        .step-btn:active { background: #2a2f45; }
        .step-val {
          width: 34px; text-align: center; border: 0; background: none; outline: none;
          color: #e5e7eb; padding: 0;
          font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          -moz-appearance: textfield;
        }
        .step-val::-webkit-outer-spin-button,
        .step-val::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

        /* Style tab: label + control rows */
        .srow {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          min-height: 30px;
        }
        .srow > .field-label { flex: 0 0 auto; }
        .sel {
          background: #161824; border: 1px solid #272a3a; border-radius: 7px;
          color: #e5e7eb; height: 28px; padding: 0 8px; outline: none; cursor: pointer;
          font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .sel:focus { border-color: #6366f1; }
        .seg { display: inline-flex; background: #161824; border: 1px solid #272a3a; border-radius: 7px; overflow: hidden; }
        .seg button {
          width: 30px; height: 28px; border: 0; background: none; cursor: pointer;
          color: #9ca3af; display: flex; align-items: center; justify-content: center; padding: 0;
        }
        .seg button + button { border-left: 1px solid #272a3a; }
        .seg button:hover { background: #22263a; color: #e5e7eb; }
        .seg button.on { background: #312e81; color: #c7d2fe; }
        .seg svg { width: 15px; height: 15px; }
        .color-ctl { display: inline-flex; align-items: center; gap: 6px; }
        .color-ctl input[type=color] {
          -webkit-appearance: none; appearance: none; width: 28px; height: 28px; padding: 0;
          border: 1px solid #272a3a; border-radius: 7px; background: none; cursor: pointer;
        }
        .color-ctl input[type=color]::-webkit-color-swatch-wrapper { padding: 2px; }
        .color-ctl input[type=color]::-webkit-color-swatch { border: 0; border-radius: 5px; }
        .color-ctl .hex {
          width: 78px; height: 28px; box-sizing: border-box;
          background: #161824; border: 1px solid #272a3a; border-radius: 7px;
          color: #e5e7eb; padding: 0 8px; outline: none;
          font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .color-ctl .hex:focus { border-color: #6366f1; }
        .color-ctl .clear {
          width: 24px; height: 28px; border: 0; background: none; color: #6b7280; cursor: pointer; border-radius: 6px;
        }
        .color-ctl .clear:hover { background: #1f2333; color: #d1d5db; }
        .sdivide { height: 1px; background: #1a1d2e; margin: 4px 0; }
        .pfoot { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid #1a1d2e; }
        .pfoot:empty { display: none; }
        .pf-btn {
          flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          background: #161824; border: 1px solid #272a3a; border-radius: 8px; color: #9ca3af;
          padding: 8px 10px; cursor: pointer; font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .pf-btn:hover { background: #1f2333; color: #e5e7eb; }
        .pf-btn svg { width: 14px; height: 14px; }
        .pf-btn.danger { color: #fca5a5; border-color: #3a2020; }
        .pf-btn.danger:hover { background: #3a1d1d; color: #fecaca; }
      </style>
      <div class="panel" id="panel">
        <div class="bp-banner" id="bpb"></div>
        <div class="risk-banner" id="rsk"></div>
        <div class="header" id="hb"></div>
        <div class="tabs" id="tabs">
          <button class="tab on" data-tab="a">Content</button>
          <button class="tab" data-tab="t">Style</button>
          <button class="tab" data-tab="s">Spacing</button>
        </div>
        <div class="body" data-body="a" id="ab"></div>
        <div class="body off" data-body="t" id="tb"></div>
        <div class="body off" data-body="s" id="sb"></div>
        <div class="pfoot" id="pf"></div>
      </div>
    `;

    this.panel = this.shadow.getElementById("panel")!;
    this.bannerEl = this.shadow.getElementById("bpb")!;
    this.riskEl = this.shadow.getElementById("rsk")!;
    this.footerBody = this.shadow.getElementById("pf")!;
    this.headerBody = this.shadow.getElementById("hb")!;
    this.attrsBody = this.shadow.getElementById("ab")!;
    this.styleBody = this.shadow.getElementById("tb")!;
    this.spacingBody = this.shadow.getElementById("sb")!;

    const tabs = this.shadow.getElementById("tabs")!;
    tabs.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>(".tab");
      if (btn) this.selectTab(btn.dataset.tab!);
    });
  }

  // Activate a tab and notify the host (so it can toggle the spacing overlay).
  private selectTab(which: string): void {
    const tabs = this.shadow.getElementById("tabs")!;
    for (const t of Array.from(tabs.querySelectorAll<HTMLElement>(".tab"))) {
      t.className = t.dataset.tab === which ? "tab on" : "tab";
    }
    for (const b of Array.from(this.shadow.querySelectorAll<HTMLElement>(".body"))) {
      b.className = b.dataset.body === which ? "body" : "body off";
    }
    this.handlers?.onTab?.(which);
  }

  // Primary action zone shown above the tabs — for images this is the dominant
  // "Choose image" button; for links it's "Open link" so the anchor can still be
  // followed while it's being edited.
  private renderHeader(el: HTMLElement, handlers: PanelHandlers, isImage: boolean): void {
    this.headerBody.innerHTML = "";

    // Element chip + "select parent" — helps navigate nested containers.
    if (!isImage) {
      const bar = document.createElement("div");
      bar.className = "el-bar";
      const chip = document.createElement("span");
      chip.className = "el-chip";
      chip.textContent = el.tagName.toLowerCase();
      bar.appendChild(chip);
      if (handlers.onParent) {
        const up = document.createElement("button");
        up.className = "el-parent";
        up.title = "Select parent element";
        up.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg><span>Parent</span>`;
        up.addEventListener("click", () => handlers.onParent!());
        bar.appendChild(up);
      }
      this.headerBody.appendChild(bar);
    }

    if (isImage) {
      const btn = document.createElement("button");
      btn.className = "choose-btn";
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="M21 15l-5-5L5 21"/>
        </svg>
        <span>Change image</span>
      `;
      btn.addEventListener("click", () => pickImage(handlers.onUpload));
      this.headerBody.appendChild(btn);
      return;
    }

    if (el instanceof HTMLAnchorElement && el.getAttribute("href")) {
      const btn = document.createElement("button");
      btn.className = "choose-btn open-btn";
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <path d="M15 3h6v6"/><path d="M10 14 21 3"/>
        </svg>
        <span>Open link</span>
      `;
      // Navigate in the same tab so the editing session (sessionStorage) carries over.
      btn.addEventListener("click", () => { window.location.href = el.href; });
      this.headerBody.appendChild(btn);
    }
  }

  private renderAttrs(el: HTMLElement, content: ElementContent, handlers: PanelHandlers): void {
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
  }

  // Typography + appearance controls. Every control writes through onStyle,
  // whose prop is checked against the shared CSS allowlist before it lands.
  private renderStyle(
    el: HTMLElement,
    content: ElementContent,
    onStyle: (prop: string, value: string) => void,
  ): void {
    const computed = window.getComputedStyle(el);
    const saved = content.style ?? {};
    const cur = (prop: string) => saved[prop] ?? computed.getPropertyValue(prop) ?? "";
    this.styleBody.innerHTML = "";
    const add = (node: Node) => this.styleBody.appendChild(node);

    // Live-preview on drag/type, persist on commit.
    const live = (prop: string, v: string) => el.style.setProperty(prop, v);
    const commit = (prop: string, v: string) => { el.style.setProperty(prop, v); onStyle(prop, v); };

    // Text align (segmented).
    add(row("Align", segmented(
      [
        { v: "left", icon: alignIcon("left") },
        { v: "center", icon: alignIcon("center") },
        { v: "right", icon: alignIcon("right") },
        { v: "justify", icon: alignIcon("justify") },
      ],
      normalizeAlign(cur("text-align")),
      (v) => commit("text-align", v),
    )));

    // Font size / line height / letter spacing (steppers).
    add(row("Font size", buildStepper({
      initial: cur("font-size"), min: 1, step: 1,
      onInput: (v) => live("font-size", v), onChange: (v) => commit("font-size", v),
    })));
    add(row("Line height", buildStepper({
      initial: cur("line-height"), min: 0, step: 0.1, unit: "",
      onInput: (v) => live("line-height", v), onChange: (v) => commit("line-height", v),
    })));
    add(row("Letter spacing", buildStepper({
      initial: cur("letter-spacing"), step: 0.5, allowNegative: true,
      onInput: (v) => live("letter-spacing", v), onChange: (v) => commit("letter-spacing", v),
    })));

    // Font weight / text transform (selects; blank = inherit/clear).
    add(row("Weight", select(
      [["", "Default"], ["400", "Normal"], ["500", "Medium"], ["600", "Semibold"], ["700", "Bold"]],
      matchWeight(cur("font-weight")),
      (v) => commit("font-weight", v),
    )));
    add(row("Transform", select(
      [["", "Default"], ["none", "None"], ["uppercase", "UPPER"], ["capitalize", "Capitalize"], ["lowercase", "lower"]],
      cur("text-transform"),
      (v) => commit("text-transform", v),
    )));

    add(divider());

    // Colors.
    add(row("Text color", buildColor({
      initial: cur("color"),
      onChange: (v) => commit("color", v),
    })));
    add(row("Background", buildColor({
      initial: saved["background-color"] ?? computed.backgroundColor,
      onChange: (v) => commit("background-color", v),
    })));

    // Corner radius.
    add(row("Radius", buildStepper({
      initial: cur("border-radius"), min: 0, step: 1,
      onInput: (v) => live("border-radius", v), onChange: (v) => commit("border-radius", v),
    })));
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
      // Per-group "link" toggle — edit all four sides together.
      const linked = { on: false };
      const inputs = new Map<string, HTMLInputElement>();

      const sec = document.createElement("div");
      sec.className = "spacing-section";

      const title = document.createElement("span");
      title.textContent = group === "padding" ? "Padding" : "Margin";

      const link = document.createElement("button");
      link.className = "link-toggle";
      link.title = "Link all sides";
      link.textContent = "🔗";
      link.addEventListener("click", () => {
        linked.on = !linked.on;
        link.className = linked.on ? "link-toggle on" : "link-toggle";
      });
      sec.append(title, link);
      this.spacingBody.appendChild(sec);

      // 3×3 box-model grid: top at col2/row1, sides at row2, bottom at col2/row3.
      const bm = document.createElement("div");
      bm.className = "bm";

      const positions: Array<{ side: typeof SPACING_SIDES[number]; col: number; row: number }> = [
        { side: "top", col: 2, row: 1 },
        { side: "left", col: 1, row: 2 },
        { side: "right", col: 3, row: 2 },
        { side: "bottom", col: 2, row: 3 },
      ];

      const mid = document.createElement("div");
      mid.className = "bm-label";
      mid.style.cssText = "grid-column:2;grid-row:2;";
      mid.textContent = group === "padding" ? "PAD" : "MAR";
      bm.appendChild(mid);

      for (const { side, col, row } of positions) {
        const prop = `${group}-${side}`;
        const raw = saved[prop] ?? computed.getPropertyValue(prop) ?? "0px";
        const { num, unit } = parseLength(raw);

        const cell = document.createElement("div");
        cell.style.cssText = `grid-column:${col};grid-row:${row};`;

        const stepper = document.createElement("div");
        stepper.className = "stepper";

        const dn = document.createElement("button");
        dn.className = "step-btn";
        dn.type = "button";
        dn.textContent = "−";

        const valInput = document.createElement("input");
        valInput.className = "step-val";
        valInput.type = "number";
        valInput.min = "0";
        valInput.value = String(num);
        valInput.title = prop;
        inputs.set(side, valInput);

        const up = document.createElement("button");
        up.className = "step-btn";
        up.type = "button";
        up.textContent = "+";

        // Applies n to this side — or to all four sides when the link is on.
        const apply = (n: number, live: boolean): void => {
          const targets: Array<[string, HTMLInputElement | undefined]> = linked.on
            ? SPACING_SIDES.map((s) => [`${group}-${s}`, inputs.get(s)])
            : [[prop, valInput]];
          for (const [p, input] of targets) {
            if (input) input.value = String(n);
            el.style.setProperty(p, `${n}${unit}`);
            if (!live) onStyle(p, `${n}${unit}`);
          }
        };

        const bump = (delta: number): void => {
          apply(Math.max(0, (parseFloat(valInput.value) || 0) + delta), false);
        };

        dn.addEventListener("click", () => bump(-1));
        up.addEventListener("click", () => bump(1));
        valInput.addEventListener("input", () => {
          apply(Math.max(0, parseFloat(valInput.value) || 0), true);
        });
        valInput.addEventListener("change", () => {
          apply(Math.max(0, parseFloat(valInput.value) || 0), false);
        });

        stepper.append(dn, valInput, up);
        cell.appendChild(stepper);
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

// --- Style-tab control builders ---

// A labelled row: "<label>  <control>".
function row(label: string, control: HTMLElement): HTMLElement {
  const r = document.createElement("div");
  r.className = "srow";
  const l = document.createElement("span");
  l.className = "field-label";
  l.textContent = label;
  r.append(l, control);
  return r;
}

function divider(): HTMLElement {
  const d = document.createElement("div");
  d.className = "sdivide";
  return d;
}

interface StepperOpts {
  initial: string;
  step?: number;
  min?: number;
  unit?: string;         // force a unit (e.g. "" for unitless line-height)
  allowNegative?: boolean;
  onInput?: (value: string) => void;
  onChange: (value: string) => void;
}

// Numeric stepper with −/+ buttons; reuses the .stepper CSS from renderSpacing.
function buildStepper(o: StepperOpts): HTMLElement {
  const parsed = parseLength(o.initial);
  const unit = o.unit !== undefined ? o.unit : parsed.unit;
  const step = o.step ?? 1;
  const floor = o.allowNegative ? -Infinity : (o.min ?? 0);

  const wrap = document.createElement("div");
  wrap.className = "stepper";

  const dn = document.createElement("button");
  dn.className = "step-btn"; dn.type = "button"; dn.textContent = "−";
  const val = document.createElement("input");
  val.className = "step-val"; val.type = "number"; val.value = String(round(parsed.num));
  if (!o.allowNegative) val.min = String(o.min ?? 0);
  const up = document.createElement("button");
  up.className = "step-btn"; up.type = "button"; up.textContent = "+";

  const compose = (n: number) => `${round(n)}${unit}`;
  const clamp = (n: number) => (n < floor ? floor : n);
  const bump = (d: number) => {
    const n = clamp((parseFloat(val.value) || 0) + d);
    val.value = String(round(n));
    o.onChange(compose(n));
  };
  dn.addEventListener("click", () => bump(-step));
  up.addEventListener("click", () => bump(step));
  val.addEventListener("input", () => {
    const n = clamp(parseFloat(val.value) || 0);
    (o.onInput ?? o.onChange)(compose(n));
  });
  val.addEventListener("change", () => {
    const n = clamp(parseFloat(val.value) || 0);
    val.value = String(round(n));
    o.onChange(compose(n));
  });

  wrap.append(dn, val, up);
  return wrap;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

interface SegOpt { v: string; icon: string; }

// Segmented icon control; empty active value means none selected.
function segmented(opts: SegOpt[], active: string, onPick: (v: string) => void): HTMLElement {
  const seg = document.createElement("div");
  seg.className = "seg";
  for (const o of opts) {
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = o.icon;
    b.className = o.v === active ? "on" : "";
    b.addEventListener("click", () => {
      for (const c of Array.from(seg.children)) c.className = "";
      b.className = "on";
      onPick(o.v);
    });
    seg.appendChild(b);
  }
  return seg;
}

function select(opts: Array<[string, string]>, active: string, onPick: (v: string) => void): HTMLElement {
  const sel = document.createElement("select");
  sel.className = "sel";
  for (const [value, label] of opts) {
    const opt = document.createElement("option");
    opt.value = value; opt.textContent = label;
    if (value === active) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => onPick(sel.value));
  return sel;
}

interface ColorOpts { initial: string; onChange: (value: string) => void; }

// Native color swatch + hex field + clear button. Clearing writes "" which
// removes the property downstream.
function buildColor(o: ColorOpts): HTMLElement {
  const hex = rgbToHex(o.initial);
  const wrap = document.createElement("div");
  wrap.className = "color-ctl";

  const pick = document.createElement("input");
  pick.type = "color";
  pick.value = hex || "#000000";

  const text = document.createElement("input");
  text.className = "hex"; text.type = "text";
  text.value = hex; text.placeholder = "—"; text.spellcheck = false;

  const clear = document.createElement("button");
  clear.type = "button"; clear.className = "clear"; clear.title = "Clear"; clear.textContent = "✕";

  pick.addEventListener("input", () => { text.value = pick.value; o.onChange(pick.value); });
  text.addEventListener("change", () => {
    const v = text.value.trim();
    if (v === "") { o.onChange(""); return; }
    if (/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v)) {
      const norm = v.startsWith("#") ? v : "#" + v;
      pick.value = norm.length === 4
        ? "#" + norm.slice(1).split("").map((c) => c + c).join("")
        : norm;
      o.onChange(norm);
    }
  });
  clear.addEventListener("click", () => { text.value = ""; o.onChange(""); });

  wrap.append(pick, text, clear);
  return wrap;
}

// Normalize computed colors ("rgb(…)", "#abc", "transparent") to "#rrggbb" or "".
function rgbToHex(input: string): string {
  const s = String(input || "").trim();
  if (!s || s === "transparent" || s === "none" || /rgba?\([^)]*,\s*0\s*\)/.test(s)) return "";
  const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (m) {
    const h = (n: string) => Number(n).toString(16).padStart(2, "0");
    return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
  }
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return ("#" + s.slice(1).split("").map((c) => c + c).join("")).toLowerCase();
  return "";
}

function normalizeAlign(v: string): string {
  const a = String(v).trim().toLowerCase();
  return ["left", "center", "right", "justify"].includes(a) ? a : "";
}

// Map a numeric/keyword font-weight to the closest select option.
function matchWeight(v: string): string {
  const s = String(v).trim().toLowerCase();
  if (s === "bold") return "700";
  if (s === "normal") return "400";
  if (["400", "500", "600", "700"].includes(s)) return s;
  return "";
}

function alignIcon(kind: "left" | "center" | "right" | "justify"): string {
  const lines: Record<string, string> = {
    left: `<line x1="3" y1="6" x2="15" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="13" y2="18"/>`,
    center: `<line x1="6" y1="6" x2="18" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="7" y1="18" x2="17" y2="18"/>`,
    right: `<line x1="9" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="11" y1="18" x2="21" y2="18"/>`,
    justify: `<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>`,
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${lines[kind]}</svg>`;
}

// Opens the OS file picker and hands the chosen image to the caller.
function pickImage(onFile: (file: File) => void): void {
  const fi = document.createElement("input");
  fi.type = "file";
  fi.accept = "image/*";
  fi.onchange = () => {
    if (fi.files?.[0]) onFile(fi.files[0]);
  };
  fi.click();
}
