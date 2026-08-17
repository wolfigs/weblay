// Connector unit tests. Run: `npm test` (esbuild-bundled, executed under node).
// Covers pure logic and the fetch-driven API client; DOM-dependent modules
// (selectorFor, sanitize) are exercised by the Playwright E2E instead.

import { test, equal, assert, rejects, run } from "./harness";
import { parseThreshold } from "../src/breakpoints";
import { normalizePath } from "../src/runtime";
import { EditAPI, ConflictError } from "../src/api";
import type { WeblayConfig } from "../src/types";

// --- breakpoints.parseThreshold ---
test("parseThreshold accepts positive integers in range", () => {
  equal(parseThreshold("640"), 640);
  equal(parseThreshold("1"), 1);
  equal(parseThreshold("10000"), 10000);
});
test("parseThreshold rejects junk / out of range", () => {
  equal(parseThreshold(""), null);
  equal(parseThreshold("0"), null);
  equal(parseThreshold("10001"), null);
  equal(parseThreshold("64px"), null);
  equal(parseThreshold("-5"), null);
});

// --- runtime.normalizePath ---
test("normalizePath mirrors server", () => {
  equal(normalizePath(""), "/");
  equal(normalizePath("/about/"), "/about");
  equal(normalizePath("about"), "/about");
  equal(normalizePath("/a/b/?x=1#h"), "/a/b");
  equal(normalizePath("/"), "/");
});

// --- EditAPI optimistic concurrency ---
function fakeConfig(): WeblayConfig {
  return { server: "https://api.test", siteKey: "sk", path: "/" } as WeblayConfig;
}

// Install a scripted fetch: each call shifts the next queued response.
function scriptFetch(responses: Array<{ status: number; body: unknown }>): () => unknown[] {
  const calls: unknown[] = [];
  (globalThis as { fetch?: unknown }).fetch = async (url: string, init?: { body?: string }) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
    const r = responses.shift() ?? { status: 500, body: { error: "no scripted response" } };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
    };
  };
  return () => calls;
}

test("drafts() records revs and saveDraft sends baseRev", async () => {
  const getCalls = scriptFetch([
    { status: 200, body: { elements: {}, revs: { "#a": 3 }, publishedVersion: 1 } },
    { status: 200, body: { status: "saved", rev: 4 } },
  ]);
  const api = new EditAPI(fakeConfig(), "tok");
  await api.drafts();
  equal(api.knownRev("#a"), 3);
  const out = await api.saveDraft("#a", { text: "x" });
  equal(out.rev, 4);
  const calls = getCalls();
  equal((calls[1] as { body: { baseRev: number } }).body.baseRev, 3);
  equal(api.knownRev("#a"), 4); // updated from the save response
});

test("saveDraft sends baseRev 0 for an unknown element", async () => {
  const getCalls = scriptFetch([{ status: 200, body: { status: "saved", rev: 1 } }]);
  const api = new EditAPI(fakeConfig(), "tok");
  await api.saveDraft("#new", { text: "y" });
  equal((getCalls()[0] as { body: { baseRev: number } }).body.baseRev, 0);
});

test("saveDraft throws ConflictError on 409 and records currentRev", async () => {
  scriptFetch([{ status: 409, body: { error: "edit conflict", currentRev: 9 } }]);
  const api = new EditAPI(fakeConfig(), "tok");
  const err = await rejects(
    () => api.saveDraft("#a", { text: "z" }),
    (e) => e instanceof ConflictError,
  );
  const ce = err as ConflictError;
  equal(ce.currentRev, 9);
  equal(ce.selector, "#a");
  equal(api.knownRev("#a"), 9); // rebased so a reload + retry succeeds
});

test("saveDraft surfaces non-conflict errors", async () => {
  scriptFetch([{ status: 400, body: { error: "bad selector" } }]);
  const api = new EditAPI(fakeConfig(), "tok");
  await rejects(
    () => api.saveDraft("#a", { text: "z" }),
    (e) => e.message === "bad selector" && !(e instanceof ConflictError),
  );
});

void run();
