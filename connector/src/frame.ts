// Device stage: hosts the page (and its editor) inside a same-origin iframe so
// device previews render like real devices. A CSS max-width on <body> cannot do
// this — position:fixed, vw units, and the site's own @media rules all key off
// the browser viewport, not a container. An iframe *is* a real viewport at the
// width we give it, so everything reflows correctly.
//
// The editor runs inside the iframe unchanged; it resizes its own frameElement
// when the device switcher changes (see editor.applyPreviewWidth).

export const STAGE_NAME = "weblay-stage";

// Height reserved at the bottom of the stage for the editor bar. The bar renders
// into the top window (see editor.buildBar) so it never overlays page content.
export const BAR_H = 52;

// True when this window is the editing stage (running inside the host iframe).
export function isStage(): boolean {
  return window.name === STAGE_NAME;
}

// Mount the full-screen host in the top window and load the current URL into a
// centered iframe named STAGE_NAME. The editor inside that iframe takes over.
export function mountStage(): void {
  document.documentElement.style.overflow = "hidden";

  const host = document.createElement("div");
  host.setAttribute("data-weblay-ui", "");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .backdrop {
        position: fixed; inset: 0; z-index: 2147483000;
        background: #0b0d17;
        display: flex; flex-direction: column; align-items: center;
        transition: padding-left .22s ease;
      }
      .stage {
        border: 0; width: 100%; max-width: 100%; flex: 1 1 auto; min-height: 0;
        background: #fff; display: block;
        transition: width .28s cubic-bezier(.4,0,.2,1), max-width .28s cubic-bezier(.4,0,.2,1);
      }
      /* A device chrome shadow appears once the stage is narrower than full. */
      .stage.framed { box-shadow: 0 0 0 1px #272a3a, 0 30px 80px rgba(0,0,0,.6); }
      /* Reserved strip the top-window editor bar sits over — no content overlap. */
      .bar-space { flex: 0 0 ${BAR_H}px; width: 100%; }
    </style>
    <div class="backdrop">
      <iframe class="stage" name="${STAGE_NAME}" title="Weblay editing stage"
              allow="clipboard-write"></iframe>
      <div class="bar-space"></div>
    </div>`;

  const iframe = shadow.querySelector<HTMLIFrameElement>("iframe")!;
  iframe.src = location.href; // token lives in sessionStorage (same origin)
  document.body.appendChild(host);
}
