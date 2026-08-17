// Security boundary for rich text and styles.
//
// Everything an editor produces (contenteditable HTML, inline styles, element
// styles) passes through here before it is stored or applied. The server runs
// an independent Go sanitizer too — this is defense in depth, not the only line.
//
// Parsing uses an inert <template>: its content fragment does not run scripts,
// load images, or fire events, so untrusted HTML is safe to walk here.

// Inline formatting tags an editor may produce. Anything else is unwrapped
// (its text is kept, the tag is dropped) so content is never silently lost.
const TAG_ALLOW = new Set([
  "A", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL", "INS",
  "CODE", "MARK", "SUB", "SUP", "SMALL", "SPAN", "BR", "ABBR", "Q",
]);

// Tags whose contents are dropped entirely (not unwrapped) — their text is
// code or metadata, never display content.
const DROP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "OBJECT", "EMBED", "TEMPLATE",
  "TEXTAREA", "TITLE", "HEAD", "SVG", "MATH",
]);

// Per-tag attribute allowlist. Global attrs (style, title) handled separately.
const ATTR_ALLOW: Record<string, Set<string>> = {
  A: new Set(["href", "target", "rel", "title"]),
  ABBR: new Set(["title"]),
};

// Inline-style properties allowed on rich-text spans. Deliberately visual-only;
// no positioning, no url()-bearing props, nothing that can load or run anything.
const INLINE_STYLE_ALLOW = new Set([
  "color", "background-color", "font-weight", "font-style",
  "text-decoration", "text-decoration-line", "text-transform", "font-size",
]);

// Element-level style properties the panel and runtime may set. Superset of the
// inline set plus box-model and sizing. Layout-only; cannot script or fetch.
const CSS_PROP_ALLOW = new Set([
  // spacing
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  // sizing
  "width", "height", "max-width", "max-height", "min-width", "min-height",
  "object-fit", "object-position",
  // typography
  "color", "background-color", "font-size", "font-weight", "font-style",
  "line-height", "letter-spacing", "text-align", "text-transform",
  "text-decoration", "font-family",
  // appearance
  "border-radius", "opacity",
]);

export function isSafeCSSProp(prop: string): boolean {
  return CSS_PROP_ALLOW.has(prop.toLowerCase().trim());
}

// Reject any value that could load a resource or smuggle markup/script.
export function isSafeCSSValue(value: string): boolean {
  return !/url\s*\(|expression\s*\(|javascript\s*:|@import|[<>]/i.test(value);
}

// URL attributes (href) may not carry active or data schemes.
function isSafeURL(value: string): boolean {
  return !/^\s*(javascript|data|vbscript|file)\s*:/i.test(value);
}

// Filter a `style="..."` attribute down to allowed, safe declarations.
function sanitizeInlineStyle(style: string, allow = INLINE_STYLE_ALLOW): string {
  const out: string[] = [];
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).toLowerCase().trim();
    const value = decl.slice(idx + 1).trim();
    if (!value) continue;
    if (!allow.has(prop)) continue;
    if (!isSafeCSSValue(value)) continue;
    out.push(`${prop}: ${value}`);
  }
  return out.join("; ");
}

// Recursively copy allowed nodes from `src` into `dst`, unwrapping the rest.
function walk(src: Node, dst: Node, depth: number): void {
  if (depth > 32) return; // guard against pathological nesting
  for (const node of Array.from(src.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      dst.appendChild(document.createTextNode(node.nodeValue ?? ""));
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue; // drop comments, etc.

    const el = node as Element;
    if (DROP_TAGS.has(el.tagName)) continue; // drop tag and its contents
    if (!TAG_ALLOW.has(el.tagName)) {
      walk(el, dst, depth + 1); // unwrap: keep contents, drop the tag
      continue;
    }

    const clean = document.createElement(el.tagName.toLowerCase());
    const attrAllow = ATTR_ALLOW[el.tagName];

    // Attributes: only the per-tag allowlist, with URL/style scrubbing.
    if (attrAllow) {
      for (const name of attrAllow) {
        const raw = el.getAttribute(name);
        if (raw == null) continue;
        if (name === "href" && !isSafeURL(raw)) continue;
        clean.setAttribute(name, raw);
      }
    }
    // Links always get safe rel and default target handling.
    if (el.tagName === "A" && clean.getAttribute("target") === "_blank") {
      clean.setAttribute("rel", "noopener noreferrer");
    }
    // Global style attribute, filtered.
    const style = el.getAttribute("style");
    if (style) {
      const safe = sanitizeInlineStyle(style);
      if (safe) clean.setAttribute("style", safe);
    }

    walk(el, clean, depth + 1);
    dst.appendChild(clean);
  }
}

// Parse untrusted HTML in an inert template and return an allowlisted string.
export function sanitizeHTML(html: string): string {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const out = document.createElement("div");
  walk(tpl.content, out, 0);
  return out.innerHTML;
}

// True when the sanitized HTML carries no formatting — i.e. plain text only,
// so the editor can store the cheaper `text` field instead of `html`.
export function isPlainText(html: string): boolean {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return !tpl.content.querySelector("*");
}
