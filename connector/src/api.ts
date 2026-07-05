// Edit-mode API client: bearer-token calls to the Inlay server.

import type { ElementContent, EditSession, InlayConfig } from "./types";

export class EditAPI {
  constructor(
    private cfg: InlayConfig,
    private token: string,
  ) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.cfg.server}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }

  session(): Promise<EditSession> {
    return this.call("GET", "/api/v1/edit/session");
  }

  drafts(): Promise<{ elements: Record<string, ElementContent>; publishedVersion: number }> {
    return this.call("GET", `/api/v1/edit/content?path=${encodeURIComponent(this.cfg.path)}`);
  }

  saveDraft(selector: string, content: ElementContent): Promise<unknown> {
    return this.call("PUT", "/api/v1/edit/content", { path: this.cfg.path, selector, content });
  }

  removeOverride(selector: string): Promise<unknown> {
    return this.call(
      "DELETE",
      `/api/v1/edit/content?path=${encodeURIComponent(this.cfg.path)}&selector=${encodeURIComponent(selector)}`,
    );
  }

  publish(): Promise<{ version: number }> {
    return this.call("POST", "/api/v1/edit/publish", { path: this.cfg.path });
  }

  async upload(file: File): Promise<{ url: string }> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${this.cfg.server}/api/v1/edit/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
    }
    return (await res.json()) as { url: string };
  }
}
