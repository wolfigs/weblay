// Multi-signal element identity + bind-time risk assessment.
//
// An override's identity is captured as a *descriptor* with several independent
// signals, so a single fragile structural path is never the only thing standing
// between an edit and its element. The descriptor is used identically by the
// client runtime, the server drift crawler, and the dashboard.
//
// assessRisk() runs the moment an editor binds to an element and returns a
// confidence score + machine-readable reasons, so the UI can warn about
// repeaters, shadow DOM, generated ids, etc. before anyone relies on the edit.

import { selectorFor } from "./selector";

export interface Fingerprint {
  tag: string;
  textHash: string;   // hash of normalized text content
  attrHash: string;   // hash of stable-ish attributes (class/role/aria/type)
  index: number;      // position among same-tag siblings
  landmark: string;   // selector of the nearest semantic ancestor
}

export interface Descriptor {
  v: 1;
  weblay?: string;    // data-weblay name (exact, author-assigned)
  idPath?: string;    // path anchored to a trusted (non-generated) id
  path: string;       // structural nth-of-type path (today's model)
  fp: Fingerprint;
}

export interface BindRisk {
  confidence: number;         // 0–100
  reasons: string[];          // machine codes (see REASONS)
  repeater?: { count: number; index: number };
}

// Machine-readable reason codes shared with the server/dashboard.
export const REASONS = {
  REPEATER: "repeater",
  REPEATER_IDENTICAL: "repeater-identical",
  SHADOW: "shadow",
  IFRAME: "iframe",
  GENERATED_ID: "generated-id",
  NO_LANDMARK: "no-landmark",
  EMPTY_TEXT: "empty-text",
} as const;

const LANDMARK_SEL =
  "main,header,footer,nav,article,aside,section,[role],[aria-label],[id]";

// ids that look framework-generated (React :r1:, CSS-modules/styled hashes, …)
// and therefore must NOT be trusted as stable anchors.
const GENERATED_ID = /^:r|(^|[-_])[a-f0-9]{5,}$|^(css|sc|jsx|mui|chakra)-/i;

export function buildDescriptor(el: Element): Descriptor {
  const d: Descriptor = {
    v: 1,
    path: selectorFor(el),
    fp: fingerprint(el),
  };
  const name = el.getAttribute("data-weblay");
  if (name) d.weblay = name;
  const idAnchor = trustedIdPath(el);
  if (idAnchor) d.idPath = idAnchor;
  return d;
}

// Assess how safely this element can be re-found later. Pure, synchronous —
// runs at bind time so the editor can warn immediately.
export function assessRisk(el: Element): BindRisk {
  const reasons: string[] = [];
  let confidence = 100;

  // Shadow DOM / cross-document: often unreachable by a document selector.
  const root = el.getRootNode();
  if (root instanceof ShadowRoot) { reasons.push(REASONS.SHADOW); confidence -= 70; }
  if (el.ownerDocument !== document) { reasons.push(REASONS.IFRAME); confidence -= 70; }

  // Repeater: member of a set of structurally-similar siblings.
  const sibs = similarSiblings(el);
  if (sibs.length >= 3) {
    const index = sibs.indexOf(el);
    const identical = sibs.every((s) => normText(s) === normText(el));
    reasons.push(identical ? REASONS.REPEATER_IDENTICAL : REASONS.REPEATER);
    confidence -= identical ? 55 : 30;
    // attach for the UI ("item 3 of 12")
    (reasons as string[]).length; // no-op to keep types simple
    return finalize(confidence, reasons, { count: sibs.length, index });
  }

  // Generated id used as our only strong anchor.
  if (el.id && GENERATED_ID.test(el.id)) { reasons.push(REASONS.GENERATED_ID); confidence -= 10; }

  // No semantic ancestor to scope a fingerprint search → more ambiguity.
  if (nearestLandmark(el) === "body") { reasons.push(REASONS.NO_LANDMARK); confidence -= 12; }

  if (normText(el) === "" && el.children.length === 0) { reasons.push(REASONS.EMPTY_TEXT); confidence -= 8; }

  return finalize(confidence, reasons);
}

function finalize(confidence: number, reasons: string[], repeater?: { count: number; index: number }): BindRisk {
  return { confidence: Math.max(0, Math.min(100, Math.round(confidence))), reasons, repeater };
}

// --- signal helpers ---

function fingerprint(el: Element): Fingerprint {
  return {
    tag: el.tagName,
    textHash: hash(normText(el)),
    attrHash: hash(attrSignature(el)),
    index: sameTagIndex(el),
    landmark: nearestLandmark(el),
  };
}

// A structural signature used to group repeater siblings: tag + sorted class
// tokens + the sequence of direct child tags (one level).
function subtreeSig(el: Element): string {
  const classes = Array.from(el.classList).sort().join(".");
  const kids = Array.from(el.children).map((c) => c.tagName).join(",");
  return `${el.tagName}|${classes}|${kids}`;
}

function similarSiblings(el: Element): Element[] {
  const parent = el.parentElement;
  if (!parent) return [el];
  const sig = subtreeSig(el);
  return Array.from(parent.children).filter(
    (c) => c.tagName === el.tagName && subtreeSig(c) === sig,
  );
}

function sameTagIndex(el: Element): number {
  const parent = el.parentElement;
  if (!parent) return 0;
  let i = 0;
  for (const c of Array.from(parent.children)) {
    if (c === el) return i;
    if (c.tagName === el.tagName) i++;
  }
  return i;
}

function nearestLandmark(el: Element): string {
  let node: Element | null = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.matches(LANDMARK_SEL)) {
      if (node.id && !GENERATED_ID.test(node.id)) return `#${cssEscape(node.id)}`;
      const label = node.getAttribute("aria-label");
      if (label) return `${node.tagName.toLowerCase()}[aria-label="${cssEscape(label)}"]`;
      const role = node.getAttribute("role");
      if (role) return `${node.tagName.toLowerCase()}[role="${cssEscape(role)}"]`;
      return node.tagName.toLowerCase();
    }
    node = node.parentElement;
  }
  return "body";
}

// A path anchored to the nearest *trusted* (non-generated) id, or undefined.
function trustedIdPath(el: Element): string | undefined {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.id && !GENERATED_ID.test(node.id) && /^[A-Za-z][\w-]*$/.test(node.id)) {
      parts.unshift(`#${cssEscape(node.id)}`);
      return parts.join(" > ");
    }
    const tag = node.tagName.toLowerCase();
    let idx = 1;
    const parent: Element | null = node.parentElement;
    if (parent) {
      for (const s of Array.from(parent.children)) {
        if (s === node) break;
        if (s.tagName === node.tagName) idx++;
      }
    }
    parts.unshift(`${tag}:nth-of-type(${idx})`);
    node = node.parentElement;
  }
  return undefined; // no trusted id ancestor
}

function attrSignature(el: Element): string {
  const keep = ["class", "role", "type", "name", "aria-label", "href", "alt"];
  return keep
    .map((k) => {
      const v = el.getAttribute(k);
      if (!v) return "";
      // classes: sort tokens; drop hashed-looking ones so build churn is ignored
      if (k === "class") {
        return "class=" + Array.from(el.classList)
          .filter((c) => !/^[a-z]+-[a-f0-9]{5,}$|^css-|^sc-/i.test(c))
          .sort().join(".");
      }
      return `${k}=${v}`;
    })
    .filter(Boolean)
    .join("|");
}

function normText(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 512);
}

// djb2 — small, dependency-free, adequate for change detection (not crypto).
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function cssEscape(s: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, "\\$&");
}

// Human-readable summary of a risk, for the editor warning UI.
export function riskSummary(risk: BindRisk): string | null {
  if (risk.reasons.includes(REASONS.SHADOW) || risk.reasons.includes(REASONS.IFRAME))
    return "This element is inside a shadow DOM / iframe — Weblay may not reach it reliably.";
  if (risk.repeater)
    return `This is item ${risk.repeater.index + 1} of ${risk.repeater.count} similar items. If the list reorders or is data-driven, this edit may move — add data-weblay="…" to lock it.`;
  if (risk.reasons.includes(REASONS.GENERATED_ID))
    return "This element's id looks build-generated (unstable). Weblay will use other signals; consider a data-weblay tag.";
  if (risk.reasons.includes(REASONS.NO_LANDMARK))
    return "No semantic ancestor nearby — re-matching after markup changes is less certain. A data-weblay tag makes it permanent.";
  return null;
}
