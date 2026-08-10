export interface ElementContent {
  text?: string;
  html?: string;
  attrs?: Record<string, string>;
  style?: Record<string, string>;
}

export interface Manifest {
  version: number;
  elements: Record<string, ElementContent>;
}

export interface InlayConfig {
  siteKey: string;
  server: string; // origin of the Inlay server, no trailing slash
  path: string;   // normalized current page path
}

export interface EditSession {
  user: { name: string; email: string };
  site: { id: string; name: string; key: string };
}
