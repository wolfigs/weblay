// Edit-mode API client: bearer-token calls to the Weblay server.

import type { ElementContent, EditSession, WeblayConfig, Revision } from "./types";

// ConflictError is thrown when a save loses to a concurrent edit (HTTP 409). It
// carries the current server-side rev so the caller can rebase and retry.
export class ConflictError extends Error {
  constructor(
    public selector: string,
    public currentRev: number,
    message = "This element was changed by someone else",
  ) {
    super(message);
    this.name = "ConflictError";
  }
}

interface DraftsResponse {
  elements: Record<string, ElementContent>;
  revs?: Record<string, number>;
  publishedVersion: number;
}

export class EditAPI {
  // Per-selector optimistic-concurrency tokens, learned from drafts() and every
  // successful save, and sent back as baseRev so the server can reject a stale
  // save instead of silently clobbering a concurrent editor.
  private revs: Record<string, number> = {};

  constructor(
    private cfg: WeblayConfig,
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

  async drafts(): Promise<DraftsResponse> {
    const res = await this.call<DraftsResponse>(
      "GET",
      `/api/v1/edit/content?path=${encodeURIComponent(this.cfg.path)}`,
    );
    this.revs = { ...(res.revs ?? {}) };
    return res;
  }

  // knownRev exposes the rev the client currently holds for a selector (for UI).
  knownRev(selector: string): number | undefined {
    return this.revs[selector];
  }

  // saveDraft sends the base rev the client holds; on 409 it throws a
  // ConflictError (and records the server's current rev so a reload + retry
  // will succeed).
  async saveDraft(selector: string, content: ElementContent, descriptor?: unknown, risk?: unknown): Promise<{ rev: number }> {
    const res = await fetch(`${this.cfg.server}/api/v1/edit/content`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        path: this.cfg.path,
        selector,
        content,
        baseRev: this.revs[selector] ?? 0,
        descriptor,
        risk,
      }),
    });
    if (res.status === 409) {
      const body = (await res.json().catch(() => ({}))) as { currentRev?: number; error?: string };
      const cur = body.currentRev ?? 0;
      this.revs[selector] = cur; // so a subsequent reload + save rebases cleanly
      throw new ConflictError(selector, cur, body.error);
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const out = (await res.json()) as { rev: number };
    this.revs[selector] = out.rev;
    return out;
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

  discard(): Promise<unknown> {
    return this.call("POST", "/api/v1/edit/discard", { path: this.cfg.path });
  }

  resetElement(selector: string): Promise<{ version: number }> {
    return this.call("POST", "/api/v1/edit/reset-element", { path: this.cfg.path, selector });
  }

  revisions(): Promise<Revision[]> {
    return this.call("GET", `/api/v1/edit/revisions?path=${encodeURIComponent(this.cfg.path)}`);
  }

  revision(id: string): Promise<Revision> {
    return this.call("GET", `/api/v1/edit/revisions/${id}`);
  }

  restoreDraft(id: string): Promise<unknown> {
    return this.call("POST", `/api/v1/edit/revisions/${id}/restore-draft`, {});
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
