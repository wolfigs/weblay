#!/usr/bin/env node
/**
 * Weblay build plugin — bakes published edits into a fully static build.
 *
 * Run it as a post-build step (or from a publish webhook that re-triggers the
 * build): it walks the built HTML files, fetches each page's published manifest,
 * and rewrites `data-weblay`-anchored elements in place. The result is a static
 * site whose edits are already in the HTML — SEO-correct with no runtime.
 *
 * Usage:
 *   node weblay-postbuild.mjs \
 *     --dir ./out \
 *     --server https://api.weblay.app \
 *     --site-key sk_live_xxx
 *
 * This mirrors the server-side rewrite core (internal/ssr) for the common
 * data-weblay case. It has no dependencies beyond Node's stdlib.
 */

import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join, extname, relative, sep } from "node:path";

const args = parseArgs(process.argv.slice(2));
if (!args.dir || !args.server || !args["site-key"]) {
  console.error("usage: weblay-postbuild.mjs --dir <build> --server <url> --site-key <key>");
  process.exit(2);
}

const files = await htmlFiles(args.dir);
let edited = 0;
for (const file of files) {
  const path = fileToPath(args.dir, file);
  const manifest = await fetchManifest(args.server, args["site-key"], path);
  if (!manifest || !manifest.elements) continue;

  let html = await readFile(file, "utf8");
  let changed = false;
  for (const [selector, content] of Object.entries(manifest.elements)) {
    const name = weblayName(selector);
    if (!name) continue; // build plugin applies data-weblay anchors
    const next = applyToElement(html, name, content);
    if (next !== html) {
      html = next;
      changed = true;
    }
  }
  if (changed) {
    await writeFile(file, html);
    edited++;
    console.log(`  edit  ${relative(args.dir, file)}`);
  }
}
console.log(`\n${edited}/${files.length} HTML files rewritten.`);

// --- helpers ---

// applyToElement replaces the text content of <tag data-weblay="NAME">...</tag>.
// A minimal, dependency-free rewrite for the common text-edit case; for full
// html/attr/style fidelity, front the site with weblay-edge or a CDN worker.
function applyToElement(html, name, content) {
  if (typeof content.text !== "string") return html;
  const re = new RegExp(
    `(<([a-zA-Z0-9]+)([^>]*\\bdata-weblay="${escapeRe(name)}"[^>]*)>)([\\s\\S]*?)(</\\2>)`,
  );
  return html.replace(re, (_, open, _tag, _attrs, _inner, close) => `${open}${escapeHtml(content.text)}${close}`);
}

async function fetchManifest(server, siteKey, path) {
  const url = `${server.replace(/\/$/, "")}/m/${encodeURIComponent(siteKey)}/manifest.json?path=${encodeURIComponent(path)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) out.push(...(await htmlFiles(full)));
    else if (extname(entry) === ".html") out.push(full);
  }
  return out;
}

// out/index.html -> "/", out/about/index.html -> "/about", out/x.html -> "/x".
function fileToPath(dir, file) {
  let rel = relative(dir, file).split(sep).join("/");
  rel = rel.replace(/index\.html$/, "").replace(/\.html$/, "");
  rel = "/" + rel.replace(/\/$/, "");
  return rel === "/" || rel === "" ? "/" : rel;
}

function weblayName(selector) {
  const m = selector.match(/^\[data-weblay="(.*)"\]$/);
  return m ? m[1].replace(/\\(.)/g, "$1") : null;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
