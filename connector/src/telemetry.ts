// Runtime verification + privacy-safe telemetry (detection channel #3).
//
// After overrides are applied, each is verified against the live DOM
// (found / missing / duplicate). A short-lived MutationObserver catches
// late-rendered (SPA) and re-render-displaced anchors. Results are beaconed to
// the server so the dashboard can show real coverage — carrying only structural
// selectors and state codes, never page content.

import type { WeblayConfig } from "./types";

export type OverrideState = "found" | "missing" | "duplicate" | "late" | "displaced";

export interface OverrideResult {
  sel: string;
  state: OverrideState;
}

// Report immediately if anything is off; otherwise sample a fraction of healthy
// loads so the server has a coverage baseline without a beacon on every view.
const COVERAGE_SAMPLE = 0.05;
const WATCH_MS = 4000;

// Verify every applied selector against the DOM and return per-override state.
export function verifyOverrides(selectors: string[]): OverrideResult[] {
  const out: OverrideResult[] = [];
  for (const sel of selectors) {
    let n = 0;
    try { n = document.querySelectorAll(sel).length; } catch { continue; }
    out.push({ sel, state: n === 0 ? "missing" : n > 1 ? "duplicate" : "found" });
  }
  return out;
}

// Watch for anchors that appear late or get displaced by a client re-render.
// Calls onUpdate with a corrected state when something changes; auto-stops.
export function watchOverrides(
  results: OverrideResult[],
  onUpdate: (r: OverrideResult) => void,
): void {
  const missing = new Set(results.filter((r) => r.state === "missing").map((r) => r.sel));
  const present = new Set(results.filter((r) => r.state === "found").map((r) => r.sel));
  if (missing.size === 0 && present.size === 0) return;
  if (typeof MutationObserver === "undefined") return;

  const obs = new MutationObserver(() => {
    for (const sel of Array.from(missing)) {
      let n = 0;
      try { n = document.querySelectorAll(sel).length; } catch { continue; }
      if (n >= 1) { missing.delete(sel); onUpdate({ sel, state: "late" }); }
    }
    for (const sel of Array.from(present)) {
      let n = 0;
      try { n = document.querySelectorAll(sel).length; } catch { continue; }
      if (n === 0) { present.delete(sel); onUpdate({ sel, state: "displaced" }); }
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), WATCH_MS);
}

// Beacon results to the public telemetry sink. Non-blocking; survives unload.
export function reportTelemetry(cfg: WeblayConfig, path: string, results: OverrideResult[]): void {
  const anomalies = results.filter((r) => r.state !== "found");
  if (anomalies.length === 0 && Math.random() > COVERAGE_SAMPLE) return;

  const payload = JSON.stringify({ path, results });
  const url = `${cfg.server}/t/${encodeURIComponent(cfg.siteKey)}`;
  // text/plain keeps this a CORS "simple" request (no preflight) even though the
  // body is JSON — the server parses it regardless of content-type.
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: "text/plain" }));
    } else {
      void fetch(url, { method: "POST", body: payload, headers: { "Content-Type": "text/plain" }, keepalive: true, mode: "no-cors" });
    }
  } catch { /* telemetry is best-effort; never affect the page */ }
}

// One-shot: verify, report, and watch for late/displaced anchors (reporting
// those too). Called by the visitor runtime after overrides are applied.
export function verifyAndReport(cfg: WeblayConfig, path: string, selectors: string[]): void {
  if (selectors.length === 0) return;
  const results = verifyOverrides(selectors);
  reportTelemetry(cfg, path, results);
  watchOverrides(results, (r) => reportTelemetry(cfg, path, [r]));
}
