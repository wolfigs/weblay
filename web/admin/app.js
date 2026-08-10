// Weblay dashboard — a deliberately small vanilla-JS app, richly styled.
// Views: setup, login, sites, site detail (tabbed: overview, pages, members,
// settings). No framework, no build step — embedded in the binary.

"use strict";

const app = document.getElementById("app");

// --- Icons (Heroicons v2, 24px outline — https://heroicons.com) ---

const S = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"';
const ICON = {
  logo: `<svg ${S}><path d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"/></svg>`, // pencil-square
  plus: `<svg ${S}><path d="M12 4.5v15m7.5-7.5h-15"/></svg>`, // plus
  arrowRight: `<svg ${S}><path d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/></svg>`, // arrow-right
  arrowLeft: `<svg ${S}><path d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/></svg>`, // arrow-left
  chevron: `<svg ${S}><path d="m19.5 8.25-7.5 7.5-7.5-7.5"/></svg>`, // chevron-down
  copy: `<svg ${S}><path d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"/></svg>`, // document-duplicate
  check: `<svg ${S}><path d="m4.5 12.75 6 6 9-13.5"/></svg>`, // check
  trash: `<svg ${S}><path d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>`, // trash
  clock: `<svg ${S}><path d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>`, // clock
  restore: `<svg ${S}><path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>`, // arrow-path
  globe: `<svg ${S}><path d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"/></svg>`, // globe-alt
  users: `<svg ${S}><path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/></svg>`, // users
  logout: `<svg ${S}><path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"/></svg>`, // arrow-right-on-rectangle
  external: `<svg ${S}><path d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg>`, // arrow-top-right-on-square
  code: `<svg ${S}><path d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"/></svg>`, // code-bracket
  layers: `<svg ${S}><path d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3"/></svg>`, // square-3-stack-3d
  cube: `<svg ${S}><path d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"/></svg>`, // cube
  alert: `<svg ${S}><path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>`, // exclamation-triangle
  info: `<svg ${S}><path d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg>`, // information-circle
  key: `<svg ${S}><path d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z"/></svg>`, // key
};

// --- API helper ---

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// --- Render helpers ---

function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
function render(fragment) {
  app.replaceChildren(fragment);
}
function val(id) {
  return document.getElementById(id).value.trim();
}
function showError(err, boxId = "err") {
  const box = document.getElementById(boxId);
  if (box) {
    box.querySelector(".msg").textContent = err.message;
    box.classList.add("show");
  } else {
    toast(err.message, { type: "error" });
  }
}
function initials(me) {
  const parts = String(me.name || me.email || "?").split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0] || "?")[0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

// --- Toasts (replaces alert) ---

function toast(title, { desc, type = "success", timeout = 3800 } = {}) {
  let root = document.getElementById("toasts");
  if (!root) { root = document.createElement("div"); root.id = "toasts"; document.body.appendChild(root); }
  const ic = type === "error" ? "alert" : type === "info" ? "info" : "check";
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.setAttribute("role", "status");
  el.innerHTML = `<span class="ti">${ICON[ic]}</span><div><div class="tt">${esc(title)}</div>${desc ? `<div class="td">${esc(desc)}</div>` : ""}</div>`;
  root.appendChild(el);
  const dismiss = () => { el.classList.add("out"); setTimeout(() => el.remove(), 220); };
  const timer = setTimeout(dismiss, timeout);
  el.addEventListener("click", () => { clearTimeout(timer); dismiss(); });
}

// --- Confirm modal (replaces confirm) ---

function confirmModal({ title, body, confirmLabel = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    let root = document.getElementById("modal-root");
    if (!root) { root = document.createElement("div"); root.id = "modal-root"; document.body.appendChild(root); }
    root.innerHTML = `
      <div class="modal-scrim" data-close></div>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
        ${danger ? `<div class="warn-icon">${ICON.alert}</div>` : ""}
        <h3 id="m-title">${esc(title)}</h3>
        <p>${body}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-cancel>Cancel</button>
          <button class="btn ${danger ? "btn-danger-solid" : "btn-primary"}" data-confirm>${esc(confirmLabel)}</button>
        </div>
      </div>`;
    root.classList.add("open");
    const prevFocus = document.activeElement;
    const close = (v) => {
      root.classList.remove("open"); root.innerHTML = "";
      document.removeEventListener("keydown", onKey);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(v);
    };
    const focusables = () => [...root.querySelectorAll("button")];
    const onKey = (e) => {
      if (e.key === "Escape") close(false);
      else if (e.key === "Tab") { // focus trap
        const f = focusables(); if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    root.querySelector("[data-cancel]").onclick = () => close(false);
    root.querySelector("[data-close]").onclick = () => close(false);
    root.querySelector("[data-confirm]").onclick = () => close(true);
    root.querySelector("[data-confirm]").focus();
  });
}

// --- Clipboard ---

async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch {}
    ta.remove();
  }
  if (btn) {
    const old = btn.innerHTML;
    btn.innerHTML = ICON.check;
    setTimeout(() => { btn.innerHTML = old; }, 1400);
  }
  toast("Copied to clipboard");
}

// --- Button loading wrapper ---

async function withLoading(btn, fn) {
  if (!btn) return fn();
  btn.classList.add("loading"); btn.disabled = true;
  try { return await fn(); }
  finally { btn.classList.remove("loading"); btn.disabled = false; }
}

// --- Shared UI fragments ---

function alertBox(id = "err") {
  return `<div class="alert error" id="${id}"><span>${ICON.alert}</span><span class="msg"></span></div>`;
}

function topnav(me, crumbs = []) {
  return `
  <header class="topnav">
    <div class="brand">
      <span class="mark">${ICON.logo}</span>
      <a href="#" class="crumb-root">Weblay</a>
      ${crumbs.map((c) => `<span class="sep">/</span>${c.href ? `<a href="${c.href}" class="crumb-name">${esc(c.label)}</a>` : `<span class="crumb-name">${esc(c.label)}</span>`}`).join("")}
    </div>
    <div class="spacer"></div>
    <div class="usermenu">
      <button class="userchip" id="userchip" aria-haspopup="menu" aria-expanded="false">
        <span class="avatar" aria-hidden="true">${esc(initials(me))}</span>
        <span class="email">${esc(me.email)}</span>
        <span class="chev">${ICON.chevron}</span>
      </button>
      <div class="menu" id="usermenu-pop" role="menu">
        <div class="menu-head"><div class="n">${esc(me.name || "Account")}</div><div class="e">${esc(me.email)}</div></div>
        <button id="signout" role="menuitem">${ICON.logout}<span>Sign out</span></button>
      </div>
    </div>
  </header>`;
}

function wireShell() {
  const chip = document.getElementById("userchip");
  const pop = document.getElementById("usermenu-pop");
  if (chip && pop) {
    chip.onclick = (e) => {
      e.stopPropagation();
      const open = !pop.classList.contains("open");
      pop.classList.toggle("open", open);
      chip.setAttribute("aria-expanded", open ? "true" : "false");
    };
    pop.addEventListener("click", (e) => e.stopPropagation());
  }
  const so = document.getElementById("signout");
  if (so) so.onclick = async () => { await api("POST", "/api/v1/auth/logout").catch(() => {}); location.hash = ""; route(); };
}

// --- Router ---

async function route() {
  try {
    const status = await api("GET", "/api/v1/status");
    if (status.needsSetup) return viewSetup();
    const me = await api("GET", "/api/v1/me").catch(() => null);
    if (!me) return viewLogin();

    const m = location.hash.match(/^#\/sites\/([a-f0-9]+)(?:\/([a-z]+))?$/);
    if (m) return viewSite(me, m[1], m[2] || "overview");
    return viewSites(me);
  } catch (err) {
    render(h(`
      <div class="auth view">
        <div class="auth-box">
          <div class="auth-brand"><span class="mark">${ICON.logo}</span></div>
          <div class="card"><div class="card-pad">
            <div class="alert error show"><span>${ICON.alert}</span><span class="msg">Cannot reach the Weblay server: ${esc(err.message)}</span></div>
            <button class="btn btn-secondary block" onclick="location.reload()">Retry</button>
          </div></div>
        </div>
      </div>`));
  }
}
window.addEventListener("hashchange", route);
window.addEventListener("resize", () => positionInk(), { passive: true });
document.addEventListener("click", () => document.querySelectorAll(".menu.open").forEach((m) => {
  m.classList.remove("open");
  const c = document.getElementById("userchip"); if (c) c.setAttribute("aria-expanded", "false");
}));

// --- Auth views ---

function authShell(inner) {
  return `<div class="auth view"><div class="auth-box">
    <div class="auth-brand"><span class="mark">${ICON.logo}</span></div>
    ${inner}
  </div></div>`;
}

function viewSetup() {
  render(h(authShell(`
    <div class="auth-title"><h1>Create your account</h1><p>First run — set up the Weblay admin</p></div>
    <div class="card"><div class="card-pad">
      ${alertBox()}
      <div class="field"><label for="name">Name</label><input id="name" autocomplete="name" placeholder="Ada Lovelace" /></div>
      <div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="email" placeholder="you@company.com" /></div>
      <div class="field"><label for="password">Password</label><input id="password" type="password" autocomplete="new-password" placeholder="At least 8 characters" /><div class="help">Use 8 or more characters.</div></div>
      <div style="margin-top:20px"><button class="btn btn-primary block lg" id="go">Create account ${ICON.arrowRight}</button></div>
    </div></div>
    <div class="auth-foot">This account owns the server. You can add teammates later.</div>
  `)));
  const go = document.getElementById("go");
  const submit = () => withLoading(go, async () => {
    try {
      await api("POST", "/api/v1/auth/setup", { name: val("name"), email: val("email"), password: val("password") });
      location.hash = ""; route();
    } catch (err) { showError(err); }
  });
  go.onclick = submit;
  bindEnter(["name", "email", "password"], submit);
  focus("name");
}

function viewLogin() {
  render(h(authShell(`
    <div class="auth-title"><h1>Sign in</h1><p>Welcome back to your dashboard</p></div>
    <div class="card"><div class="card-pad">
      ${alertBox()}
      <div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="email" placeholder="you@company.com" /></div>
      <div class="field"><label for="password">Password</label><input id="password" type="password" autocomplete="current-password" placeholder="••••••••" /></div>
      <div style="margin-top:20px"><button class="btn btn-primary block lg" id="go">Sign in ${ICON.arrowRight}</button></div>
    </div></div>
  `)));
  const go = document.getElementById("go");
  const submit = () => withLoading(go, async () => {
    try { await api("POST", "/api/v1/auth/login", { email: val("email"), password: val("password") }); route(); }
    catch (err) { showError(err); }
  });
  go.onclick = submit;
  bindEnter(["email", "password"], submit);
  focus("email");
}

// --- Sites list ---

async function viewSites(me) {
  siteCtx = null;
  render(h(`${topnav(me)}<main class="view"><div class="page-head"><div class="grow"><h1>Projects</h1></div></div>${skeletonGrid()}</main>`));
  wireShell();

  let sites;
  try { sites = await api("GET", "/api/v1/sites"); }
  catch (err) { return showError(err); }

  const cards = sites.map((s) => `
    <a class="site-card" href="#/sites/${s.id}">
      <div class="sc-top">
        <span class="sc-icon">${ICON.cube}</span>
        <span class="sc-name truncate">${esc(s.name)}</span>
        <span class="go-arrow">${ICON.arrowRight}</span>
      </div>
      <div class="sc-meta">
        <span class="badge mono">${esc(s.siteKey)}</span>
        <span class="badge neutral">${ICON.globe}${(s.origins || []).length} origin${(s.origins || []).length === 1 ? "" : "s"}</span>
      </div>
    </a>`).join("");

  render(h(`
    ${topnav(me)}
    <main class="view">
      <div class="page-head">
        <div class="grow">
          <h1>Projects</h1>
          <div class="sub">Connect a site, edit it in place, publish versioned revisions.</div>
        </div>
        <button class="btn btn-primary" id="new-site-btn">${ICON.plus} New site</button>
      </div>

      ${sites.length === 0
        ? `<div class="card"><div class="empty">
             <div class="ei">${ICON.layers}</div>
             <h3>No sites yet</h3>
             <p>Create your first site to get an install snippet and start editing.</p>
           </div></div>`
        : `<div class="grid stagger">${cards}</div>`}

      <div class="section-title"><h2>Connect a site</h2></div>
      <div class="card" id="create-card"><div class="card-pad">
        ${alertBox()}
        <div class="row wrap" style="align-items:flex-end">
          <div class="field grow" style="margin:0"><label for="site-name">Site name</label><input id="site-name" placeholder="Marketing site" /></div>
          <div class="field grow" style="margin:0"><label for="site-origin">Origin <span class="faint">(optional)</span></label><input id="site-origin" placeholder="https://example.com" /></div>
        </div>
      </div>
      <div class="card-foot">
        <span class="note grow">The origin is where the editor is allowed to run. You can add more later.</span>
        <button class="btn btn-primary" id="create">${ICON.plus} Create site</button>
      </div></div>
    </main>
  `));
  wireShell();

  document.getElementById("new-site-btn").onclick = () => {
    document.getElementById("create-card").scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => focus("site-name"), 200);
  };

  const create = document.getElementById("create");
  const doCreate = () => withLoading(create, async () => {
    try {
      const site = await api("POST", "/api/v1/sites", { name: val("site-name"), origin: val("site-origin").replace(/\/$/, "") });
      toast("Site created", { desc: site.name });
      location.hash = `#/sites/${site.id}`;
    } catch (err) { showError(err); }
  });
  create.onclick = doCreate;
  bindEnter(["site-name", "site-origin"], doCreate);
}

// --- Site detail (tabbed) ---

const SITE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "pages", label: "Pages", count: true },
  { id: "members", label: "Members", count: true },
  { id: "settings", label: "Settings" },
];
let siteCtx = null;

async function viewSite(me, siteID, tab = "overview") {
  render(h(`${topnav(me, [{ label: "…" }])}<main class="view">${skeletonDetail()}</main>`));
  wireShell();

  let site, pages, members;
  try {
    [site, pages, members] = await Promise.all([
      api("GET", `/api/v1/sites/${siteID}`),
      api("GET", `/api/v1/sites/${siteID}/pages`),
      api("GET", `/api/v1/sites/${siteID}/members`),
    ]);
  } catch (err) { return showError(err); }

  const server = location.origin;
  const snippet = `<script src="${server}/weblay.js" data-site="${site.siteKey}"></script>`;
  const snippetHTML =
    `&lt;<span class="tok-tag">script</span> <span class="tok-attr">src</span>=<span class="tok-str">"${esc(server)}/weblay.js"</span> <span class="tok-attr">data-site</span>=<span class="tok-str">"${esc(site.siteKey)}"</span>&gt;&lt;/<span class="tok-tag">script</span>&gt;`;

  const originsHTML = (site.origins || []).length
    ? (site.origins || []).map((o) => `
        <div class="row" style="padding:9px 0;border-bottom:1px solid var(--border)">
          <span class="grow mono" style="font-size:13px">${esc(o)}</span>
          <button class="icon-btn" data-remove-origin="${esc(o)}" aria-label="Remove ${esc(o)}">${ICON.trash}</button>
        </div>`).join("")
    : `<p class="faint" style="font-size:13px">No origins yet. The editor only works from origins listed here.</p>`;

  const counts = { pages: pages.length, members: members.length };
  const tabsNav = `
    <div class="tabs" id="site-tabs" role="tablist" aria-label="Site sections">
      ${SITE_TABS.map((t) => `<button class="tab" role="tab" id="tab-${t.id}" data-tab="${t.id}" aria-controls="panel-${t.id}" aria-selected="false" tabindex="-1">${t.label}${t.count ? `<span class="count">${counts[t.id]}</span>` : ""}</button>`).join("")}
      <span class="tab-ink" aria-hidden="true"></span>
    </div>`;

  const overviewPanel = `
    <section class="panel" role="tabpanel" data-panel="overview" id="panel-overview" aria-labelledby="tab-overview" tabindex="0" hidden>
      <div class="section-title"><h2>Open editor</h2></div>
      <div class="card"><div class="card-pad">
        ${alertBox("editor-err")}
        <div class="field" style="margin:0"><label for="edit-url">Page URL to open in edit mode</label>
          <input id="edit-url" placeholder="https://example.com/about" value="${esc((site.origins || [])[0] || "")}" /></div>
      </div>
      <div class="card-foot">
        <span class="note grow">Opens the page with a 4-hour edit token in the URL fragment.</span>
        <button class="btn btn-primary" id="edit-open">${ICON.external} Open editor</button>
      </div></div>

      <div class="section-title"><h2>Install</h2><span class="hint">Add to every page, ideally in &lt;head&gt;</span></div>
      <div class="card"><div class="card-pad">
        <p class="muted" style="font-size:13px;margin-bottom:12px">Tag elements with <code>data-weblay="name"</code> for flash-free, rename-proof editing. Untagged text and images are editable too.</p>
        <div class="snippet">${snippetHTML}<button class="icon-btn copy" id="copy-snippet" aria-label="Copy install snippet">${ICON.copy}</button></div>
      </div></div>
    </section>`;

  const pagesPanel = `
    <section class="panel" role="tabpanel" data-panel="pages" id="panel-pages" aria-labelledby="tab-pages" tabindex="0" hidden>
      <div class="card">
        ${pages.length === 0
          ? `<div class="empty"><div class="ei">${ICON.code}</div><h3>Nothing edited yet</h3><p>Open the editor and click any text or image to start.</p></div>`
          : `<div class="table-wrap"><table>
              <thead><tr><th>Path</th><th>Published</th><th></th></tr></thead>
              <tbody>${pages.map((p) => `
                <tr>
                  <td><span class="path">${esc(p.path)}</span></td>
                  <td><span class="badge success"><span class="dot"></span>v${p.publishedVersion}</span></td>
                  <td class="t-actions"><button class="btn btn-ghost sm" data-revisions="${p.id}" data-path="${esc(p.path)}">${ICON.clock} History</button></td>
                </tr>`).join("")}</tbody>
            </table></div>
            <div id="revisions"></div>`}
      </div>
    </section>`;

  const membersPanel = `
    <section class="panel" role="tabpanel" data-panel="members" id="panel-members" aria-labelledby="tab-members" tabindex="0" hidden>
      <div class="card">
        <div class="table-wrap"><table>
          <thead><tr><th>Email</th><th>Name</th><th>Role</th></tr></thead>
          <tbody>${members.map((m) => `<tr><td>${esc(m.email)}</td><td class="muted">${esc(m.name) || "—"}</td><td><span class="badge ${m.role === "owner" ? "accent" : "neutral"}"><span class="dot"></span>${esc(m.role)}</span></td></tr>`).join("")}</tbody>
        </table></div>
        <div class="card-pad" style="border-top:1px solid var(--border)">
          ${alertBox("member-err")}
          <div class="row wrap">
            <div class="grow"><input id="member-email" placeholder="teammate@example.com" /></div>
            <select id="member-role" style="width:auto;min-width:130px"><option value="editor">Editor</option><option value="owner">Owner</option></select>
            <button class="btn btn-secondary" id="add-member">${ICON.users} Add member</button>
          </div>
          <p class="faint" style="font-size:12.5px;margin-top:10px">Members must already have an account on this Weblay server.</p>
        </div>
      </div>
    </section>`;

  const settingsPanel = `
    <section class="panel" role="tabpanel" data-panel="settings" id="panel-settings" aria-labelledby="tab-settings" tabindex="0" hidden>
      <div class="section-title"><h2>Allowed origins</h2></div>
      <div class="card"><div class="card-pad">
        ${alertBox()}
        ${originsHTML}
        <div class="row" style="margin-top:14px">
          <div class="grow"><input id="new-origin" placeholder="https://example.com" /></div>
          <button class="btn btn-secondary" id="add-origin">${ICON.plus} Add</button>
        </div>
      </div></div>

      <div class="section-title"><h2 style="color:var(--danger)">Danger zone</h2></div>
      <div class="card" style="border-color:rgba(255,97,102,.3)">
        <div class="card-pad row wrap">
          <div class="grow"><div style="font-weight:600;font-size:14px">Delete this site</div><div class="faint" style="font-size:13px">Removes all its content, revisions, and members. This cannot be undone.</div></div>
          <button class="btn btn-danger" id="delete-site">${ICON.trash} Delete site</button>
        </div>
      </div>
    </section>`;

  render(h(`
    ${topnav(me, [{ label: site.name }])}
    <main class="view">
      <a class="back-link" href="#">${ICON.arrowLeft} Projects</a>
      <div class="page-head">
        <div class="grow">
          <h1>${esc(site.name)}</h1>
          <div class="sub"><span class="badge mono" style="vertical-align:middle">${esc(site.siteKey)}</span></div>
        </div>
        <button class="btn btn-secondary" id="copy-key">${ICON.key} Copy key</button>
      </div>
      ${tabsNav}
      <div class="panels">${overviewPanel}${pagesPanel}${membersPanel}${settingsPanel}</div>
    </main>
  `));
  wireShell();

  document.getElementById("copy-key").onclick = (e) => copyText(site.siteKey, e.currentTarget);
  document.getElementById("copy-snippet").onclick = (e) => copyText(snippet, e.currentTarget);

  const editBtn = document.getElementById("edit-open");
  editBtn.onclick = () => withLoading(editBtn, async () => {
    try {
      const url = new URL(val("edit-url"));
      if (!(site.origins || []).includes(url.origin)) {
        throw new Error(`${url.origin} is not in this site's allowed origins — add it first`);
      }
      const { token } = await api("POST", `/api/v1/sites/${siteID}/edit-token`, {});
      window.open(`${url.href.split("#")[0]}#weblay=${token}`, "_blank");
      toast("Editor opened in a new tab", { type: "info" });
    } catch (err) { showError(err, "editor-err"); }
  });

  const addOriginBtn = document.getElementById("add-origin");
  addOriginBtn.onclick = () => withLoading(addOriginBtn, async () => {
    try {
      await api("POST", `/api/v1/sites/${siteID}/origins`, { origin: val("new-origin").replace(/\/$/, "") });
      toast("Origin added"); route();
    } catch (err) { showError(err); }
  });
  bindEnter(["new-origin"], () => addOriginBtn.click());

  for (const btn of app.querySelectorAll("[data-remove-origin]")) {
    btn.onclick = async () => {
      try { await api("DELETE", `/api/v1/sites/${siteID}/origins`, { origin: btn.dataset.removeOrigin }); toast("Origin removed"); route(); }
      catch (err) { showError(err); }
    };
  }

  for (const btn of app.querySelectorAll("[data-revisions]")) {
    btn.onclick = () => withLoading(btn, async () => {
      const revs = await api("GET", `/api/v1/sites/${siteID}/pages/${btn.dataset.revisions}/revisions`);
      const target = document.getElementById("revisions");
      target.replaceChildren(h(`
        <div class="card-pad" style="border-top:1px solid var(--border)">
          <div class="row" style="margin-bottom:10px"><h2 style="font-size:13px;color:var(--text-dim)">History · <span class="mono">${esc(btn.dataset.path)}</span></h2></div>
          ${revs.length === 0 ? `<p class="faint" style="font-size:13px">No published revisions yet.</p>` : `
            <div class="table-wrap"><table>
              <thead><tr><th>Version</th><th>Published</th><th></th></tr></thead>
              <tbody>${revs.map((r, i) => `
                <tr>
                  <td><span class="badge ${i === 0 ? "success" : "neutral"}">${i === 0 ? `<span class="dot"></span>` : ""}v${r.version}${i === 0 ? " · live" : ""}</span></td>
                  <td class="muted num">${esc(new Date(r.publishedAt).toLocaleString())}</td>
                  <td class="t-actions">${i === 0 ? "" : `<button class="btn btn-ghost sm" data-restore="${r.id}">${ICON.restore} Restore</button>`}</td>
                </tr>`).join("")}</tbody>
            </table></div>`}
        </div>`));
      for (const rbtn of target.querySelectorAll("[data-restore]")) {
        rbtn.onclick = () => withLoading(rbtn, async () => {
          try {
            const rev = await api("POST", `/api/v1/sites/${siteID}/revisions/${rbtn.dataset.restore}/restore`, {});
            toast(`Restored — now live as v${rev.version}`, { type: "success" });
            route();
          } catch (err) { showError(err); }
        });
      }
    });
  }

  const addMemberBtn = document.getElementById("add-member");
  addMemberBtn.onclick = () => withLoading(addMemberBtn, async () => {
    try {
      await api("POST", `/api/v1/sites/${siteID}/members`, { email: val("member-email"), role: document.getElementById("member-role").value });
      toast("Member added"); route();
    } catch (err) { showError(err, "member-err"); }
  });
  bindEnter(["member-email"], () => addMemberBtn.click());

  document.getElementById("delete-site").onclick = async () => {
    const ok = await confirmModal({
      title: `Delete “${site.name}”?`,
      body: `This permanently removes all content, revisions, and members for this site. This action cannot be undone.`,
      confirmLabel: "Delete site",
      danger: true,
    });
    if (!ok) return;
    try { await api("DELETE", `/api/v1/sites/${siteID}`); toast("Site deleted"); location.hash = ""; route(); }
    catch (err) { showError(err); }
  };

  // Tabs
  siteCtx = { id: siteID, currentTab: null };
  wireTabs();
  activateTab(SITE_TABS.some((t) => t.id === tab) ? tab : "overview");
}

// --- Tab controller ---

function activateTab(tab, { focus = false } = {}) {
  const list = document.getElementById("site-tabs");
  if (!list) return;
  const valid = SITE_TABS.some((t) => t.id === tab) ? tab : "overview";
  for (const btn of list.querySelectorAll(".tab")) {
    const on = btn.dataset.tab === valid;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
    btn.tabIndex = on ? 0 : -1;
    if (on && focus) btn.focus();
  }
  for (const p of document.querySelectorAll(".panel")) p.hidden = p.dataset.panel !== valid;
  if (siteCtx) siteCtx.currentTab = valid;
  requestAnimationFrame(positionInk);
}

function positionInk() {
  const list = document.getElementById("site-tabs");
  if (!list) return;
  const ink = list.querySelector(".tab-ink");
  const active = list.querySelector(".tab.active");
  if (!ink || !active) return;
  ink.style.width = `${active.offsetWidth}px`;
  ink.style.transform = `translateX(${active.offsetLeft}px)`;
}

function goTab(tab, focus = false) {
  if (!siteCtx) return;
  activateTab(tab, { focus });
  // Deep-linkable URL without re-running the router (no refetch / no flash).
  const target = tab === "overview" ? `#/sites/${siteCtx.id}` : `#/sites/${siteCtx.id}/${tab}`;
  history.replaceState(null, "", target);
}

function wireTabs() {
  const list = document.getElementById("site-tabs");
  if (!list) return;
  const tabs = [...list.querySelectorAll(".tab")];
  list.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (btn) goTab(btn.dataset.tab);
  });
  list.addEventListener("keydown", (e) => {
    const i = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
    let j = -1;
    if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = tabs.length - 1;
    if (j < 0) return;
    e.preventDefault();
    goTab(tabs[j].dataset.tab, true);
  });
}

// --- Skeletons ---

function skeletonGrid() {
  return `<div class="grid">${Array.from({ length: 3 }).map(() => `<div class="skel skel-card"></div>`).join("")}</div>`;
}
function skeletonDetail() {
  return `
    <a class="back-link" href="#">${ICON.arrowLeft} Projects</a>
    <div class="page-head"><div class="grow"><div class="skel skel-line" style="width:200px;height:26px"></div></div></div>
    <div class="skel skel-line" style="width:320px;height:38px;margin:24px 0"></div>
    ${Array.from({ length: 2 }).map(() => `<div class="skel skel-card" style="height:90px;margin-bottom:12px"></div>`).join("")}`;
}

// --- Small input helpers ---

function bindEnter(ids, fn) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); fn(); } });
  }
}
function focus(id) { const el = document.getElementById(id); if (el) el.focus(); }

route();
