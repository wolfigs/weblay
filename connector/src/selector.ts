// Stable element addressing. Explicit `data-weblay` names win; otherwise a
// structural path selector is computed. Paths use nth-of-type so unrelated
// siblings (text nodes, other tags) don't shift the address.

export function selectorFor(el: Element): string {
  const name = el.getAttribute("data-weblay");
  if (name) return `[data-weblay="${cssEscape(name)}"]`;

  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.body && node !== document.documentElement) {
    const parent: Element | null = node.parentElement;
    if (node.id && isSafeId(node.id)) {
      // An id anchors the path — shorter and survives layout shuffles above it.
      parts.unshift(`#${cssEscape(node.id)}`);
      return parts.join(" > ");
    }
    const tag = node.tagName.toLowerCase();
    let index = 1;
    if (parent) {
      for (const sib of Array.from(parent.children)) {
        if (sib === node) break;
        if (sib.tagName === node.tagName) index++;
      }
    }
    parts.unshift(`${tag}:nth-of-type(${index})`);
    node = parent;
  }
  parts.unshift("body");
  return parts.join(" > ");
}

function isSafeId(id: string): boolean {
  return /^[A-Za-z][\w-]*$/.test(id);
}

function cssEscape(s: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, "\\$&");
}
