export interface ElementContent {
  text?: string;
  html?: string;
  attrs?: Record<string, string>;
  style?: Record<string, string>;   // base styles — all screen sizes
  media?: Record<string, Record<string, string>>; // breakpoint id → styles
}

export interface Manifest {
  version: number;
  elements: Record<string, ElementContent>;
}

export interface Revision {
  id: string;
  pageId: string;
  version: number;
  manifest?: Manifest;
  publishedBy: string;
  publishedAt: string;
}

export interface WeblayConfig {
  siteKey: string;
  server: string; // origin of the Weblay server, no trailing slash
  path: string;   // normalized current page path
}

export interface EditSession {
  user: { name: string; email: string };
  site: { id: string; name: string; key: string };
}
