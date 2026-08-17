/**
 * Weblay + Next.js — server-side edit application for SEO-correct pages.
 *
 * Next.js middleware runs on the edge runtime and cannot rewrite a streamed HTML
 * body, so the robust integration is a tiny server-side helper you call while
 * rendering: fetch the page's published manifest and read edited values by their
 * `data-weblay` name. Because the values are baked into the server-rendered
 * HTML, crawlers and social-preview bots see the edits in the first byte.
 *
 * Set WEBLAY_SERVER and WEBLAY_SITE_KEY in the environment.
 */

export interface ElementContent {
  text?: string;
  html?: string;
  attrs?: Record<string, string>;
}

export interface Manifest {
  version: number;
  elements: Record<string, ElementContent>;
}

/** Fetch a page's published manifest (cached to match its own 30s max-age). */
export async function weblayManifest(path: string): Promise<Manifest> {
  const server = process.env.WEBLAY_SERVER!;
  const siteKey = process.env.WEBLAY_SITE_KEY!;
  const url = `${server}/m/${encodeURIComponent(siteKey)}/manifest.json?path=${encodeURIComponent(path)}`;
  try {
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return { version: 0, elements: {} };
    return (await res.json()) as Manifest;
  } catch {
    return { version: 0, elements: {} };
  }
}

/** Read the edited text for a `data-weblay` name, falling back to a default. */
export function weblayText(m: Manifest, name: string, fallback: string): string {
  const c = m.elements[`[data-weblay="${name}"]`];
  return c?.text ?? fallback;
}

/** Read an edited attribute (e.g. an <img> src) for a `data-weblay` name. */
export function weblayAttr(m: Manifest, name: string, attr: string, fallback: string): string {
  const c = m.elements[`[data-weblay="${name}"]`];
  return c?.attrs?.[attr] ?? fallback;
}
