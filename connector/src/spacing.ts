// Visual box-model spacing editor. Overlays the selected element with the
// classic devtools box model: an outer margin box and inner content box, with
// draggable grips on all four sides of each. Drag a padding grip to change that
// side's padding; drag a margin grip for margin. Mirrors the image resize
// handles so spacing feels just as direct.
//
// Values are reported in px through onLive (during drag) and onDone (on release,
// which the editor persists to the active breakpoint bucket).

type Side = "top" | "right" | "bottom" | "left";
type Group = "padding" | "margin";

interface Grip {
  group: Group;
  side: Side;
  el: HTMLElement;
}

interface Drag {
  grip: Grip;
  startX: number;
  startY: number;
  startVal: number;
}

export class SpacingHandles {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private overlay!: HTMLElement;
  private marginBox!: HTMLElement;
  private contentBox!: HTMLElement;
  private label!: HTMLElement;
  private grips: Grip[] = [];
  private target: HTMLElement | null = null;
  private drag: Drag | null = null;

  constructor(
    private onLive: (prop: string, valuePx: number) => void,
    private onDone: (prop: string, valuePx: number) => void,
  ) {
    this.host = document.createElement("div");
    this.host.setAttribute("data-weblay-ui", "");
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.build();
    document.body.appendChild(this.host);
    window.addEventListener("scroll", this.sync, { passive: true });
    window.addEventListener("resize", this.sync, { passive: true });
    document.addEventListener("mousemove", this.onMove);
    document.addEventListener("mouseup", this.onUp);
  }

  destroy(): void {
    window.removeEventListener("scroll", this.sync);
    window.removeEventListener("resize", this.sync);
    document.removeEventListener("mousemove", this.onMove);
    document.removeEventListener("mouseup", this.onUp);
    this.host.remove();
  }

  attach(el: HTMLElement): void {
    this.target = el;
    this.overlay.style.display = "block";
    this.sync();
  }

  detach(): void {
    this.overlay.style.display = "none";
    this.target = null;
    this.drag = null;
  }

  private build(): void {
    const SIDES: Side[] = ["top", "right", "bottom", "left"];
    this.shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .ov { display: none; position: fixed; pointer-events: none; z-index: 2147483644; }
        .box { position: absolute; box-sizing: border-box; border-radius: 3px; }
        .margin-box { border: 1px dashed rgba(251,191,36,.9); }
        .content-box { border: 1px dashed rgba(45,212,191,.9); }
        .grip {
          position: absolute; pointer-events: all; box-sizing: border-box;
          transform: translate(-50%, -50%); border-radius: 4px;
          box-shadow: 0 1px 4px rgba(0,0,0,.4);
        }
        .grip.padding { background: #2dd4bf; }
        .grip.margin { background: #fbbf24; }
        .grip.top, .grip.bottom { width: 26px; height: 7px; cursor: ns-resize; }
        .grip.left, .grip.right { width: 7px; height: 26px; cursor: ew-resize; }
        .grip:hover { filter: brightness(1.15); }
        .label {
          position: absolute; display: none; transform: translate(-50%, -50%);
          background: #0b0d17; color: #e5e7eb; border: 1px solid #272a3a;
          font: 11px ui-monospace, SFMono-Regular, Menlo, monospace;
          padding: 3px 7px; border-radius: 5px; white-space: nowrap; pointer-events: none;
          z-index: 1;
        }
        .label b { color: #a5b4fc; font-weight: 600; }
      </style>
      <div class="ov" id="ov">
        <div class="box margin-box" id="mbox"></div>
        <div class="box content-box" id="cbox"></div>
        ${(["margin", "padding"] as Group[])
          .flatMap((g) => SIDES.map((s) => `<div class="grip ${g} ${s}" data-g="${g}" data-s="${s}"></div>`))
          .join("")}
        <div class="label" id="label"></div>
      </div>`;

    this.overlay = this.shadow.getElementById("ov")!;
    this.marginBox = this.shadow.getElementById("mbox")!;
    this.contentBox = this.shadow.getElementById("cbox")!;
    this.label = this.shadow.getElementById("label")!;

    for (const el of Array.from(this.shadow.querySelectorAll<HTMLElement>(".grip"))) {
      const grip: Grip = { group: el.dataset.g as Group, side: el.dataset.s as Side, el };
      this.grips.push(grip);
      el.addEventListener("mousedown", (e) => this.startDrag(e, grip));
    }
  }

  private px(v: string): number {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  private metrics() {
    const el = this.target!;
    const r = el.getBoundingClientRect(); // border box
    const cs = getComputedStyle(el);
    return {
      r,
      border: { t: this.px(cs.borderTopWidth), r: this.px(cs.borderRightWidth), b: this.px(cs.borderBottomWidth), l: this.px(cs.borderLeftWidth) },
      pad: { t: this.px(cs.paddingTop), r: this.px(cs.paddingRight), b: this.px(cs.paddingBottom), l: this.px(cs.paddingLeft) },
      mar: { t: this.px(cs.marginTop), r: this.px(cs.marginRight), b: this.px(cs.marginBottom), l: this.px(cs.marginLeft) },
    };
  }

  // Position the overlay (at the element's margin box) and every grip so they
  // sit on the live padding/margin boundaries.
  private sync = (): void => {
    if (!this.target || this.overlay.style.display === "none") return;
    const m = this.metrics();
    const { r, border, pad, mar } = m;

    const ox = r.left - mar.l, oy = r.top - mar.t;
    const ow = mar.l + r.width + mar.r, oh = mar.t + r.height + mar.b;
    this.overlay.style.left = `${ox}px`;
    this.overlay.style.top = `${oy}px`;
    this.overlay.style.width = `${ow}px`;
    this.overlay.style.height = `${oh}px`;

    // Boxes are positioned relative to the overlay (margin box) origin.
    const bx = mar.l, by = mar.t, bw = r.width, bh = r.height;
    place(this.marginBox, 0, 0, ow, oh);
    const cx = bx + border.l + pad.l, cy = by + border.t + pad.t;
    place(this.contentBox, cx, cy, bw - border.l - border.r - pad.l - pad.r, bh - border.t - border.b - pad.t - pad.b);

    const midX = bx + bw / 2, midY = by + bh / 2;
    for (const g of this.grips) {
      const pos = this.gripPos(g, { bx, by, bw, bh, ow, oh, border, pad, midX, midY });
      g.el.style.left = `${pos.x}px`;
      g.el.style.top = `${pos.y}px`;
    }
  };

  private gripPos(
    g: Grip,
    ctx: { bx: number; by: number; bw: number; bh: number; ow: number; oh: number;
           border: Record<"t" | "r" | "b" | "l", number>; pad: Record<"t" | "r" | "b" | "l", number>;
           midX: number; midY: number },
  ): { x: number; y: number } {
    const { bx, by, bw, bh, ow, oh, border, pad, midX, midY } = ctx;
    if (g.group === "margin") {
      switch (g.side) {
        case "top": return { x: midX, y: 0 };
        case "bottom": return { x: midX, y: oh };
        case "left": return { x: 0, y: midY };
        case "right": return { x: ow, y: midY };
      }
    }
    switch (g.side) { // padding grips sit at the content edge
      case "top": return { x: midX, y: by + border.t + pad.t };
      case "bottom": return { x: midX, y: by + bh - border.b - pad.b };
      case "left": return { x: bx + border.l + pad.l, y: midY };
      case "right": return { x: bx + bw - border.r - pad.r, y: midY };
    }
  }

  private startDrag(e: MouseEvent, grip: Grip): void {
    e.preventDefault();
    e.stopPropagation();
    if (!this.target) return;
    const cs = getComputedStyle(this.target);
    const startVal = this.px(cs.getPropertyValue(`${grip.group}-${grip.side}`));
    this.drag = { grip, startX: e.clientX, startY: e.clientY, startVal };
    this.showLabel(grip, startVal);
  }

  private onMove = (e: MouseEvent): void => {
    if (!this.drag || !this.target) return;
    const { grip, startX, startY, startVal } = this.drag;
    const dx = e.clientX - startX, dy = e.clientY - startY;

    // Padding grows when a grip is dragged inward; margin grows when dragged
    // outward. Per side, translate the pointer delta into a signed amount.
    const inward: Record<Side, number> = { top: dy, bottom: -dy, left: dx, right: -dx };
    const outward: Record<Side, number> = { top: -dy, bottom: dy, left: -dx, right: dx };
    const delta = grip.group === "padding" ? inward[grip.side] : outward[grip.side];

    const val = Math.max(0, Math.round(startVal + delta));
    const prop = `${grip.group}-${grip.side}`;
    this.target.style.setProperty(prop, `${val}px`);
    this.onLive(prop, val);
    this.sync();
    this.showLabel(grip, val);
  };

  private onUp = (): void => {
    if (!this.drag || !this.target) return;
    const { grip } = this.drag;
    const prop = `${grip.group}-${grip.side}`;
    const val = this.px(getComputedStyle(this.target).getPropertyValue(prop));
    this.drag = null;
    this.label.style.display = "none";
    this.onDone(prop, Math.round(val));
  };

  private showLabel(grip: Grip, val: number): void {
    const pos = grip.el.getBoundingClientRect();
    const ov = this.overlay.getBoundingClientRect();
    this.label.style.display = "block";
    this.label.style.left = `${pos.left + pos.width / 2 - ov.left}px`;
    this.label.style.top = `${pos.top + pos.height / 2 - ov.top - 18}px`;
    this.label.innerHTML = `<b>${grip.group === "padding" ? "Padding" : "Margin"} ${grip.side}</b> ${val}px`;
  }
}

function place(el: HTMLElement, x: number, y: number, w: number, h: number): void {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.width = `${Math.max(0, w)}px`;
  el.style.height = `${Math.max(0, h)}px`;
}
