// Resize handles overlay for selected images.
// 8 handles (4 corners + 4 edges) rendered in a Shadow DOM, fixed-positioned
// over the image. Shift-drag locks the aspect ratio.

export interface ResizeDone {
  widthPx: number;
  heightPx: number;
}

type HandlePos = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const ALL_POSITIONS: HandlePos[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export class ImageHandles {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private overlay!: HTMLElement;
  private badge!: HTMLElement;
  private img: HTMLImageElement | null = null;
  private onDone: (r: ResizeDone) => void;
  private dragging: {
    pos: HandlePos;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null = null;
  private ratio = 1;

  constructor(onDone: (r: ResizeDone) => void) {
    this.onDone = onDone;
    this.host = document.createElement("div");
    this.host.setAttribute("data-weblay-ui", "");
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.buildOverlay();
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

  attach(img: HTMLImageElement): void {
    this.img = img;
    this.ratio =
      img.naturalWidth > 0 && img.naturalHeight > 0
        ? img.naturalWidth / img.naturalHeight
        : 1;
    this.overlay.style.display = "block";
    this.sync();
  }

  detach(): void {
    this.overlay.style.display = "none";
    this.img = null;
    this.dragging = null;
  }

  private buildOverlay(): void {
    this.shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .ov {
          display: none; position: fixed; pointer-events: none;
          border: 2px solid #6366f1; border-radius: 2px;
          z-index: 2147483645;
        }
        .h {
          position: absolute; width: 10px; height: 10px;
          background: #6366f1; border: 2px solid #fff; border-radius: 2px;
          pointer-events: all; box-sizing: border-box;
          transform: translate(-50%, -50%);
        }
        .h[data-p="nw"] { top:0; left:0;   cursor:nw-resize; }
        .h[data-p="n"]  { top:0; left:50%; cursor:n-resize;  }
        .h[data-p="ne"] { top:0; left:100%;cursor:ne-resize; }
        .h[data-p="e"]  { top:50%;left:100%;cursor:e-resize; }
        .h[data-p="se"] { top:100%;left:100%;cursor:se-resize;}
        .h[data-p="s"]  { top:100%;left:50%;cursor:s-resize; }
        .h[data-p="sw"] { top:100%;left:0;  cursor:sw-resize;}
        .h[data-p="w"]  { top:50%;left:0;   cursor:w-resize; }
        .badge {
          position: absolute; bottom: -24px; left: 50%; transform: translateX(-50%);
          background: #0b0d17; color: #a5b4fc; border: 1px solid #272a3a;
          font: 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          padding: 2px 8px; border-radius: 4px; white-space: nowrap; pointer-events: none;
        }
      </style>
      <div class="ov" id="ov">
        ${ALL_POSITIONS.map((p) => `<div class="h" data-p="${p}"></div>`).join("")}
        <div class="badge" id="badge"></div>
      </div>
    `;

    this.overlay = this.shadow.getElementById("ov")!;
    this.badge = this.shadow.getElementById("badge")!;

    for (const h of Array.from(this.shadow.querySelectorAll<HTMLElement>(".h"))) {
      h.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.img) return;
        const rect = this.img.getBoundingClientRect();
        this.dragging = {
          pos: (h.dataset["p"] ?? "se") as HandlePos,
          startX: e.clientX,
          startY: e.clientY,
          startW: rect.width,
          startH: rect.height,
        };
      });
    }
  }

  private sync = (): void => {
    if (!this.img || this.overlay.style.display === "none") return;
    const r = this.img.getBoundingClientRect();
    this.overlay.style.top = `${r.top}px`;
    this.overlay.style.left = `${r.left}px`;
    this.overlay.style.width = `${r.width}px`;
    this.overlay.style.height = `${r.height}px`;
    this.badge.textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
  };

  private onMove = (e: MouseEvent): void => {
    if (!this.dragging || !this.img) return;
    const { pos, startX, startY, startW, startH } = this.dragging;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const lock = e.shiftKey;

    let w = startW;
    let h = startH;

    if (pos.includes("e")) w = Math.max(20, startW + dx);
    if (pos.includes("w")) w = Math.max(20, startW - dx);
    if (pos.includes("s")) h = Math.max(20, startH + dy);
    if (pos.includes("n")) h = Math.max(20, startH - dy);

    if (lock) {
      if (pos.length === 2) {
        // corner: scale height off width
        h = w / this.ratio;
      } else if (pos === "n" || pos === "s") {
        w = h * this.ratio;
      } else {
        h = w / this.ratio;
      }
    }

    w = Math.round(w);
    h = Math.round(h);
    this.img.style.width = `${w}px`;
    this.img.style.height = `${h}px`;
    this.sync();
  };

  private onUp = (): void => {
    if (!this.dragging || !this.img) return;
    const r = this.img.getBoundingClientRect();
    this.dragging = null;
    this.onDone({ widthPx: Math.round(r.width), heightPx: Math.round(r.height) });
  };
}
