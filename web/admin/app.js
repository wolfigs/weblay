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
  close: `<svg ${S}><path d="M6 18 18 6M6 6l12 12"/></svg>`, // x-mark
};

// --- API helper ---

function csrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)weblay_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

async function api(method, path, body) {
  const headers = body ? { "Content-Type": "application/json" } : {};
  // Double-submit CSRF token on state-changing requests.
  if (!["GET", "HEAD"].includes(method.toUpperCase())) headers["X-CSRF-Token"] = csrfToken();
  const res = await fetch(path, {
    method,
    headers,
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
// Compact relative time ("2h ago", "just now") with an absolute-time title.
function relTime(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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
      <a href="#" class="crumb-root">Wolfigs <span class="product">Weblay</span></a>
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
        <div class="menu-head"><div class="n">${esc(me.name || "Account")}</div><div class="e">${esc(me.email)}</div>${me.role && me.role !== "member" ? `<div class="role-tag">${esc(me.role === "super_admin" ? "Super admin" : "Admin")}</div>` : ""}</div>
        ${(me.role === "super_admin" || (me.permissions || []).includes("manage_users")) ? `<a href="#/admin" role="menuitem" class="menu-link">${ICON.logo}<span>Admin panel</span></a>` : ""}
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

// ---- live health sync ----
// While a site view is open we poll for drift/health changes so the dashboard
// reflects reality without a manual reload. Cleared on every navigation.
let healthPoll = null;
function stopHealthPoll() { if (healthPoll) { clearInterval(healthPoll); healthPoll = null; } }
// True while the user is mid-interaction, so a background refresh never steals
// focus or yanks the view out from under them.
function userBusy() {
  const a = document.activeElement;
  if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) return true;
  return !!document.querySelector(".modal, .menu.open");
}

async function route() {
  stopHealthPoll();
  try {
    const status = await api("GET", "/api/v1/status");
    if (status.needsSetup) return viewSetup();
    const me = await api("GET", "/api/v1/me").catch(() => null);
    if (!me) return viewLogin();

    if (location.hash.startsWith("#/admin")) return viewAdmin(me);
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
    <a class="site-card${s.issues > 0 ? " has-alert" : ""}" href="#/sites/${s.id}">
      <div class="sc-top">
        <span class="sc-icon">${ICON.cube}</span>
        <span class="sc-name truncate">${esc(s.name)}</span>
        ${s.issues > 0 ? `<span class="sc-alert" title="${s.issues} override${s.issues === 1 ? " needs" : "s need"} attention">${ICON.alert}</span>` : ""}
        <span class="go-arrow">${ICON.arrowRight}</span>
      </div>
      <div class="sc-meta">
        <span class="badge mono">${esc(s.siteKey)}</span>
        <span class="badge neutral">${ICON.globe}${(s.origins || []).length} origin${(s.origins || []).length === 1 ? "" : "s"}</span>
        ${s.issues > 0 ? `<span class="badge warn">${s.issues} to fix</span>` : ""}
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
          <div class="field grow" style="margin:0"><label for="site-origin">Site URL <span class="faint">(recommended)</span></label><input id="site-origin" placeholder="https://example.com" /></div>
        </div>
      </div>
      <div class="card-foot">
        <span class="note grow">Your live site's address — Weblay opens the editor there, verifies the install, and checks your edits against it. Enter it once; everything else derives from it.</span>
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

// Slide-over drawer showing a page's publish history as a readable timeline.
// Far clearer than dumping a detached table under the whole pages list.
async function openHistoryDrawer(siteID, pageID, path, liveVersion, draft = { hasDraft: false, draftAt: null }) {
  let root = document.getElementById("drawer-root");
  if (!root) { root = document.createElement("div"); root.id = "drawer-root"; document.body.appendChild(root); }

  const bodyHTML = `<div class="drawer-loading">${ICON.clock}<span>Loading history…</span></div>`;
  root.innerHTML = `
    <div class="drawer-scrim" data-close></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dr-title">
      <header class="drawer-head">
        <div class="drawer-heading">
          <div class="drawer-eyebrow">Publish history</div>
          <h3 id="dr-title"><span class="mono">${esc(path)}</span></h3>
        </div>
        <button class="icon-btn" data-close aria-label="Close">${ICON.close}</button>
      </header>
      <div class="drawer-body" id="drawer-body">${bodyHTML}</div>
    </aside>`;
  requestAnimationFrame(() => root.classList.add("open"));

  const prevFocus = document.activeElement;
  const close = () => {
    root.classList.remove("open");
    document.removeEventListener("keydown", onKey);
    setTimeout(() => { root.innerHTML = ""; }, 220);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  root.querySelectorAll("[data-close]").forEach((el) => (el.onclick = close));

  const body = document.getElementById("drawer-body");
  let revs;
  try {
    revs = await api("GET", `/api/v1/sites/${siteID}/pages/${pageID}/revisions`);
  } catch (err) {
    body.innerHTML = `<div class="drawer-loading err">${err.message}</div>`;
    return;
  }

  // The unpublished working draft sits above the published timeline, with its
  // own Publish / Discard controls.
  const draftCard = draft.hasDraft ? `
    <div class="draft-card">
      <div class="draft-head">
        <span class="badge warn"><span class="dot"></span>Unpublished draft</span>
        ${draft.draftAt ? `<span class="draft-when">edited ${esc(relTime(draft.draftAt))}</span>` : ""}
      </div>
      <p class="draft-note">Changes saved but not yet live.</p>
      <div class="draft-actions">
        <button class="btn btn-primary sm" id="draft-publish">${ICON.check} Publish now</button>
        <button class="btn btn-danger sm" id="draft-discard">${ICON.trash} Discard</button>
      </div>
    </div>` : "";

  if (!revs.length) {
    body.innerHTML = draftCard + `<div class="empty sm"><div class="ei">${ICON.clock}</div><h3>No published revisions</h3><p>Publish an edit and it will appear here.</p></div>`;
    wireDraftActions();
    return;
  }

  body.innerHTML = draftCard + `
    <div class="tl-heading">Published versions</div>
    <ol class="timeline">
      ${revs.map((r, i) => {
        const live = i === 0;
        const d = new Date(r.publishedAt);
        return `
        <li class="tl-item${live ? " live" : ""}">
          <span class="tl-node"></span>
          <div class="tl-card">
            <div class="tl-row">
              <span class="badge ${live ? "success" : "neutral"}">${live ? `<span class="dot"></span>` : ""}v${r.version}</span>
              ${live ? `<span class="tl-live">Live now</span>` : `<button class="btn btn-ghost sm" data-restore="${r.id}" data-ver="${r.version}">${ICON.restore} Restore</button>`}
            </div>
            <div class="tl-time">${esc(d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }))} · ${esc(d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }))}</div>
          </div>
        </li>`;
      }).join("")}
    </ol>`;
  wireDraftActions();

  function wireDraftActions() {
    const pub = document.getElementById("draft-publish");
    if (pub) pub.onclick = () => withLoading(pub, async () => {
      try {
        const { version } = await api("POST", `/api/v1/sites/${siteID}/pages/${pageID}/publish`, {});
        toast(`Published — v${version} is live`, { type: "success", desc: path });
        close(); route();
      } catch (err) { showError(err); }
    });
    const dis = document.getElementById("draft-discard");
    if (dis) dis.onclick = async () => {
      const ok = await confirmModal({
        title: `Discard draft on ${path}?`,
        body: `This reverts <b>${esc(path)}</b> to its last published version. Unpublished edits will be lost.`,
        confirmLabel: "Discard changes", danger: true,
      });
      if (!ok) return;
      try {
        await api("POST", `/api/v1/sites/${siteID}/pages/${pageID}/discard`, {});
        toast("Draft discarded", { type: "success" });
        close(); route();
      } catch (err) { showError(err); }
    };
  }

  for (const rbtn of body.querySelectorAll("[data-restore]")) {
    rbtn.onclick = async () => {
      const ok = await confirmModal({
        title: `Restore v${rbtn.dataset.ver}?`,
        body: `This republishes <b>${esc(path)}</b> from version ${esc(rbtn.dataset.ver)}, replacing the current live v${liveVersion}. It becomes a new published version.`,
        confirmLabel: `Restore v${rbtn.dataset.ver}`,
      });
      if (!ok) return;
      await withLoading(rbtn, async () => {
        try {
          const rev = await api("POST", `/api/v1/sites/${siteID}/revisions/${rbtn.dataset.restore}/restore`, {});
          toast(`Restored — now live as v${rev.version}`, { type: "success" });
          close();
          route();
        } catch (err) { showError(err); }
      });
    };
  }
}

// --- Loading indicator configurator (Overview → Install) ---
//
// The loader is configured entirely via script-tag data-* attributes so it can
// show with zero latency. This UI just builds that snippet + previews it; there
// is nothing to persist server-side.

function loaderAttrs(server, siteKey, L) {
  const a = [["src", `${server}/weblay.js`], ["data-site", siteKey]];
  if (L.mode === "custom") {
    a.push(["data-loader-el", L.customEl || "#my-loader"]);
  } else if (L.mode && L.mode !== "none") {
    a.push(["data-loader", L.mode]);
    if (L.mode === "overlay" || L.mode === "bar") a.push(["data-loader-accent", L.accent]);
    if (L.mode === "overlay") {
      a.push(["data-loader-bg", L.bg]);
      if (L.text) a.push(["data-loader-text", L.text]);
      if (L.logo) a.push(["data-loader-logo", L.logo]);
    }
  }
  return a;
}

function buildSnippet(server, siteKey, L) {
  const attrs = loaderAttrs(server, siteKey, L).map(([k, v]) => `${k}="${v}"`).join(" ");
  return `<script ${attrs}></script>`;
}

function highlightSnippet(server, siteKey, L) {
  const attrs = loaderAttrs(server, siteKey, L)
    .map(([k, v]) => ` <span class="tok-attr">${esc(k)}</span>=<span class="tok-str">"${esc(v)}"</span>`)
    .join("");
  return `&lt;<span class="tok-tag">script</span>${attrs}&gt;&lt;/<span class="tok-tag">script</span>&gt;`;
}

function wireLoaderConfigurator(server, siteKey) {
  const L = { mode: "none", bg: "#ffffff", accent: "#6366f1", text: "Loading…", logo: "", customEl: "#my-loader" };
  const modeBar = document.getElementById("ldr-mode");
  const optsBox = document.getElementById("ldr-opts");
  const preview = document.getElementById("ldr-preview");
  const code = document.getElementById("snippet-code");
  if (!modeBar) return L;

  const colorRow = (label, key) => `
    <div class="lrow"><span class="lrow-label">${label}</span>
      <span class="color-ctl">
        <input type="color" data-k="${key}" value="${esc(L[key])}" />
        <input type="text" class="hex" data-k="${key}" value="${esc(L[key])}" spellcheck="false" />
      </span></div>`;
  const textRow = (label, key, ph) => `
    <div class="lrow"><span class="lrow-label">${label}</span>
      <input type="text" class="linput" data-k="${key}" value="${esc(L[key])}" placeholder="${ph}" /></div>`;

  function renderOpts() {
    let html = "";
    if (L.mode === "bar") html = colorRow("Accent", "accent");
    else if (L.mode === "overlay") html = colorRow("Background", "bg") + colorRow("Spinner", "accent") + textRow("Text", "text", "Loading…") + textRow("Logo URL", "logo", "https://…/logo.svg");
    else if (L.mode === "skeleton") html = `<p class="faint" style="font-size:12.5px;margin:0">Shimmer placeholders appear over elements tagged <code>data-weblay</code> (or <code>data-weblay-skeleton</code>) until content loads.</p>`;
    else if (L.mode === "custom") html = textRow("Element selector", "customEl", "#my-loader") + `<p class="faint" style="font-size:12.5px;margin:6px 0 0">Weblay hides your own loader element once content is ready. Full control, zero delay.</p>`;
    optsBox.innerHTML = html;
    for (const inp of optsBox.querySelectorAll("[data-k]")) {
      inp.oninput = () => {
        L[inp.dataset.k] = inp.value;
        if (inp.type === "color") { // sync the paired hex field
          const hex = optsBox.querySelector(`input.hex[data-k="${inp.dataset.k}"]`);
          if (hex) hex.value = inp.value;
        }
        update();
      };
    }
  }

  function renderPreview() {
    const m = L.mode;
    if (m === "none") { preview.className = "ldr-preview"; preview.innerHTML = `<div class="ldr-none">No loader — content appears when it arrives.</div>`; return; }
    preview.className = "ldr-preview on";
    if (m === "bar") {
      preview.innerHTML = `<div class="pv-bar" style="--acc:${esc(L.accent)}"></div><div class="pv-page"></div>`;
    } else if (m === "overlay") {
      preview.innerHTML = `<div class="pv-ov" style="background:${esc(L.bg)}">
        ${L.logo ? `<img src="${esc(L.logo)}" alt="" onerror="this.style.display='none'"/>` : ""}
        <div class="pv-spin" style="--acc:${esc(L.accent)}"></div>
        ${L.text ? `<div class="pv-txt" style="color:${esc(L.accent)}">${esc(L.text)}</div>` : ""}
      </div>`;
    } else if (m === "skeleton") {
      preview.innerHTML = `<div class="pv-sk"><span></span><span></span><span style="width:60%"></span></div>`;
    } else {
      preview.innerHTML = `<div class="ldr-none">Your element <code>${esc(L.customEl || "#my-loader")}</code> shows, then Weblay hides it.</div>`;
    }
  }

  function update() {
    renderPreview();
    if (code) code.innerHTML = highlightSnippet(server, siteKey, L);
  }

  modeBar.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-m]");
    if (!b) return;
    L.mode = b.dataset.m;
    for (const x of modeBar.querySelectorAll("button")) x.classList.toggle("on", x === b);
    renderOpts();
    update();
  });

  renderOpts();
  update();
  return L;
}

// --- Override health (drift detection) ---

const STATUS_META = {
  healthy:     { label: "Healthy",     cls: "success" },
  at_risk:     { label: "At risk",     cls: "warn" },
  broken:      { label: "Broken",      cls: "danger" },
  quarantined: { label: "Quarantined", cls: "danger" },
};

// What happened to the element, and the fix Weblay recommends for each.
const CATEGORY_META = {
  moved:              { label: "Moved",         tone: "warn",   desc: "The element moved to a new position — your edit no longer lands on it.", actions: ["rebind"] },
  "content-conflict": { label: "Source changed", tone: "warn",  desc: "The original text under your edit changed in the source. Your edit still applies, but may now mask new content.", actions: ["reset"] },
  replaced:           { label: "Replaced",      tone: "danger", desc: "A different element now sits where your edit was. Applying it here would edit the wrong element.", actions: ["rebind", "reset"] },
  removed:            { label: "Removed",       tone: "danger", desc: "The target element is gone from the live page.", actions: ["reset", "rebind"] },
  ambiguous:          { label: "Ambiguous",     tone: "danger", desc: "Several matching elements — Weblay can't tell which is yours.", actions: ["rebind", "harden"] },
};

const REASON_LABELS = {
  "repeater": "One of several similar items", "repeater-identical": "One of several identical items",
  "repeater-ambiguous": "Ambiguous among identical siblings", "shadow": "Inside a shadow DOM",
  "iframe": "Inside an iframe", "generated-id": "Build-generated id (unstable)",
  "no-landmark": "No semantic ancestor nearby", "empty-text": "No text to anchor on",
  "text-changed": "Source text changed", "tag-changed": "Element tag changed",
  "not-found": "Not found on the live page", "ambiguous-path": "Selector matches multiple elements",
  "duplicate-anchor": "Duplicate anchor", "resolved-by-fingerprint": "Re-matched by content",
  "resolved-by-attrs": "Re-matched by attributes", "redesign-suspected": "Major markup change — page paused",
  "unverified": "Not yet crawl-verified", "no-descriptor": "No identity captured yet",
  "slot-reused": "Another element took its place", "attr-lookalike": "Only a look-alike remains",
};

// Classify a page's change scope from its bindings.
function scopeOf(bindings) {
  const total = bindings.length;
  const issues = bindings.filter((b) => b.status !== "healthy").length;
  const revamp = bindings.some((b) => (b.reasons || []).includes("redesign-suspected")) || (total >= 3 && issues / total >= 0.6);
  if (revamp) return { level: "revamp", label: "Full revamp", tone: "danger" };
  if (issues / total > 0.15) return { level: "significant", label: "Significant change", tone: "warn" };
  if (issues > 0) return { level: "slight", label: "Slight change", tone: "warn" };
  return { level: "ok", label: "Healthy", tone: "success" };
}

function healthStat(label, n, cls) { return `<span class="hstat ${cls}"><b>${n}</b> ${label}</span>`; }

const ACTION_BTN = {
  rebind: (b) => `<button class="btn btn-primary sm" data-rebind='${esc(JSON.stringify({ sel: b.selector, path: b.path }))}'>${ICON.restore} Re-bind</button>`,
  reset:  (b) => `<button class="btn btn-danger sm" data-reset-el='${esc(JSON.stringify({ id: b.pageId, sel: b.selector, path: b.path }))}'>${ICON.trash} Reset</button>`,
  harden: (b) => `<button class="btn btn-ghost sm" data-harden='${esc(JSON.stringify({ sel: b.selector }))}'>${ICON.key} Harden</button>`,
};

function bindingRow(b) {
  const meta = CATEGORY_META[b.category] || { label: STATUS_META[b.status]?.label || b.status, tone: "warn", desc: "", actions: ["rebind", "harden"] };
  const badgeCls = meta.tone === "danger" ? "danger-badge" : "warn";
  const coverage = b.hits + b.misses > 0 ? Math.round((b.hits / (b.hits + b.misses)) * 100) : null;
  const reasons = (b.reasons || []).filter((r) => r !== "redesign-suspected").map((r) => REASON_LABELS[r] || r);
  const actions = (meta.actions || []).map((a) => ACTION_BTN[a] && ACTION_BTN[a](b)).filter(Boolean).join("");
  return `
    <div class="hrow">
      <div class="hrow-top">
        <span class="badge ${badgeCls}"><span class="dot"></span>${meta.label}</span>
        <span class="hconf" title="Confidence">${b.confidence}%</span>
        <code class="hsel" title="${esc(b.selector)}">${esc(b.selector)}</code>
      </div>
      <div class="hdesc">${esc(meta.desc || "")}</div>
      <div class="hfoot">
        <span class="hmeta">
          ${coverage !== null ? `applied on ${coverage}% of loads` : "no runtime data yet"}
          ${reasons.length ? ` · ${reasons.map(esc).join(" · ")}` : ""}
        </span>
        <span class="hactions">${actions}</span>
      </div>
    </div>`;
}

// Group bindings by page, show problem pages first with a scope banner.
function renderHealth(bindings, ctx) {
  if (!bindings.length) {
    return `<div class="card"><div class="empty sm"><div class="ei">${ICON.check}</div><h3>No overrides yet</h3><p>Health appears here once you publish edits.</p></div></div>`;
  }
  const byPath = {};
  for (const b of bindings) (byPath[b.path || "/"] = byPath[b.path || "/"] || []).push(b);

  const problemPages = [];
  let healthyPages = 0;
  for (const [path, group] of Object.entries(byPath)) {
    const scope = scopeOf(group);
    if (scope.level === "ok") { healthyPages++; continue; }
    problemPages.push([path, group, scope]);
  }
  // Worst scope first.
  const rank = { revamp: 0, significant: 1, slight: 2 };
  problemPages.sort((a, b) => rank[a[2].level] - rank[b[2].level]);

  if (problemPages.length === 0) {
    return `<div class="card"><div class="empty sm"><div class="ei" style="color:var(--success)">${ICON.check}</div><h3>All overrides healthy</h3><p>Every edit resolves cleanly on the live pages.</p></div></div>`;
  }

  const pv = ctx.pageVersion || (() => 0);
  const html = problemPages.map(([path, group, scope]) => {
    const problems = group.filter((b) => b.status !== "healthy");
    const version = pv(path);
    const revampBanner = scope.level === "revamp" ? `
      <div class="revamp">
        <div class="revamp-head">${ICON.alert}<b>Major markup change on ${esc(path)}</b></div>
        <p>${problems.length} of ${group.length} edits no longer match — this looks like a redesign. Choose how to proceed:</p>
        <div class="revamp-actions">
          <button class="btn btn-danger sm" data-reset-page-health="${ctx.pageId(path)}" data-path="${esc(path)}">${ICON.restore} Reset page (adopt new design)</button>
          ${version > 1 ? `<button class="btn btn-secondary sm" data-health-history="${ctx.pageId(path)}" data-path="${esc(path)}" data-version="${version}">${ICON.clock} Roll back</button>` : ""}
          <span class="revamp-note">…or re-bind edits individually below.</span>
        </div>
      </div>` : "";
    return `
      <div class="hpage">
        <div class="hpage-head">
          <a class="path path-link" href="${esc(ctx.liveURL(path))}" target="_blank" rel="noopener">${esc(path)}${ICON.external}</a>
          <span class="scope ${scope.tone}">${scope.label}</span>
          <span class="hpage-count">${problems.length} of ${group.length} need${problems.length === 1 ? "s" : ""} attention</span>
        </div>
        ${revampBanner}
        <div class="hlist">${problems.map(bindingRow).join("")}</div>
      </div>`;
  }).join("");

  const healthyNote = healthyPages > 0
    ? `<div class="hhealthy">${ICON.check} ${healthyPages} page${healthyPages === 1 ? "" : "s"} fully healthy</div>` : "";
  return html + healthyNote;
}

// --- Site detail (tabbed) ---

// --- Wolfigs platform admin panel (super admin manages accounts + roles) ---

const PERM_LABELS = {
  manage_users: "Manage users",
  manage_sites: "Manage sites",
  manage_content: "Manage content",
  manage_billing: "Manage billing",
  view_metrics: "View metrics",
};

function roleBadge(role) {
  if (role === "super_admin") return `<span class="badge warn">Super admin</span>`;
  if (role === "admin") return `<span class="badge neutral">Admin</span>`;
  return `<span class="badge">Member</span>`;
}

async function viewAdmin(me) {
  siteCtx = null;
  render(h(`${topnav(me, [{ label: "Admin" }])}<main class="view">${skeletonGrid()}</main>`));
  wireShell();

  let overview, data;
  try {
    [overview, data] = await Promise.all([
      api("GET", "/api/v1/admin/overview"),
      api("GET", "/api/v1/admin/users"),
    ]);
  } catch (err) { return showError(err); }

  const isSuper = me.role === "super_admin";
  const users = data.users || [];
  const perms = overview.permissions || [];

  const rows = users.map((u) => `
    <tr>
      <td><div class="u-name">${esc(u.name || "—")}</div><div class="u-email mono">${esc(u.email)}</div></td>
      <td>${roleBadge(u.role)}</td>
      <td>${(u.permissions || []).length
        ? (u.permissions || []).map((p) => `<span class="chip">${esc(PERM_LABELS[p] || p)}</span>`).join(" ")
        : (u.role === "super_admin" ? `<span class="muted">all</span>` : `<span class="muted">—</span>`)}</td>
      <td class="right">
        ${u.role === "super_admin"
          ? `<span class="muted" title="The super admin cannot be modified here">protected</span>`
          : (isSuper
              ? `<button class="btn btn-ghost sm" data-edit="${u.id}">Edit role</button>
                 ${u.id === me.id ? "" : `<button class="btn btn-ghost sm danger" data-del="${u.id}">Remove</button>`}`
              : `<span class="muted">—</span>`)}
      </td>
    </tr>`).join("");

  render(h(`
    ${topnav(me, [{ label: "Admin" }])}
    <main class="view">
      <div class="page-head">
        <div class="grow">
          <h1>Wolfigs admin</h1>
          <div class="sub">Accounts and roles for the Wolfigs platform (Weblay${overview.product && overview.product !== "Weblay" ? ` · ${esc(overview.product)}` : ""}).</div>
        </div>
        ${isSuper ? `<button class="btn btn-primary" id="add-admin-btn">${ICON.plus} Add account</button>` : ""}
      </div>

      <div class="grid stagger" style="grid-template-columns:repeat(3,1fr)">
        <div class="card"><div class="card-pad"><div class="stat"><div class="stat-n">${overview.totalUsers}</div><div class="stat-l">Accounts</div></div></div></div>
        <div class="card"><div class="card-pad"><div class="stat"><div class="stat-n">${overview.admins}</div><div class="stat-l">Admins</div></div></div></div>
        <div class="card"><div class="card-pad"><div class="stat"><div class="stat-n">${overview.superAdmins}</div><div class="stat-l">Super admins</div></div></div></div>
      </div>

      <div class="section-title"><h2>Accounts</h2></div>
      <div class="card"><div class="table-wrap"><table class="tbl">
        <thead><tr><th>Account</th><th>Role</th><th>Permissions</th><th class="right">Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>
    </main>`));
  wireShell();

  if (isSuper) {
    const addBtn = document.getElementById("add-admin-btn");
    if (addBtn) addBtn.onclick = () => adminAccountModal(me, perms, null);
    document.querySelectorAll("[data-edit]").forEach((b) => {
      b.onclick = () => adminAccountModal(me, perms, users.find((u) => u.id === b.dataset.edit));
    });
    document.querySelectorAll("[data-del]").forEach((b) => {
      b.onclick = async () => {
        const u = users.find((x) => x.id === b.dataset.del);
        if (!await confirmModal({ title: "Remove account", body: `Remove <b>${esc(u.email)}</b>? This cannot be undone.`, confirmLabel: "Remove", danger: true })) return;
        try { await api("DELETE", `/api/v1/admin/users/${u.id}`); toast("Account removed"); route(); }
        catch (err) { toast(err.message, { type: "error" }); }
      };
    });
  }
}

// adminAccountModal creates a new account or edits an existing one's role.
function adminAccountModal(me, perms, existing) {
  const editing = !!existing;
  const cur = existing || { role: "member", permissions: [] };
  let root = document.getElementById("modal-root");
  if (!root) { root = document.createElement("div"); root.id = "modal-root"; document.body.appendChild(root); }
  const permBoxes = perms.map((p) => `
    <label class="checkrow"><input type="checkbox" name="perm" value="${p}" ${(cur.permissions || []).includes(p) ? "checked" : ""}> ${esc(PERM_LABELS[p] || p)}</label>`).join("");
  root.innerHTML = `
    <div class="modal-scrim" data-close></div>
    <div class="modal wide" role="dialog" aria-modal="true">
      <h3>${editing ? "Edit role" : "Add account"}</h3>
      ${editing ? `<p class="mono muted">${esc(existing.email)}</p>` : `
        <div class="field"><label>Email</label><input id="a-email" type="email" placeholder="person@example.com"></div>
        <div class="field"><label>Name</label><input id="a-name" type="text" placeholder="Full name"></div>
        <div class="field"><label>Temporary password</label><input id="a-pass" type="password" placeholder="At least 8 characters"></div>`}
      <div class="field"><label>Role</label>
        <select id="a-role">
          <option value="member" ${cur.role === "member" ? "selected" : ""}>Member</option>
          <option value="admin" ${cur.role === "admin" ? "selected" : ""}>Admin</option>
        </select>
      </div>
      <div class="field" id="perm-field" style="${cur.role === "admin" ? "" : "display:none"}">
        <label>Admin permissions</label>
        <div class="checkgrid">${permBoxes}</div>
      </div>
      <div class="alert error" id="a-err"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-primary" id="a-save">${editing ? "Save" : "Create"}</button>
      </div>
    </div>`;
  root.classList.add("open");
  const close = () => { root.classList.remove("open"); root.innerHTML = ""; };
  root.querySelector("[data-cancel]").onclick = close;
  root.querySelector("[data-close]").onclick = close;
  const roleSel = document.getElementById("a-role");
  roleSel.onchange = () => { document.getElementById("perm-field").style.display = roleSel.value === "admin" ? "" : "none"; };
  document.getElementById("a-save").onclick = async () => {
    const role = roleSel.value;
    const selectedPerms = [...root.querySelectorAll('input[name="perm"]:checked')].map((c) => c.value);
    const payload = { role, permissions: role === "admin" ? selectedPerms : [] };
    try {
      if (editing) {
        await api("PATCH", `/api/v1/admin/users/${existing.id}`, payload);
        toast("Role updated");
      } else {
        payload.email = val("a-email"); payload.name = val("a-name"); payload.password = val("a-pass");
        await api("POST", "/api/v1/admin/users", payload);
        toast("Account created");
      }
      close(); route();
    } catch (err) {
      const box = document.getElementById("a-err");
      box.textContent = err.message; box.classList.add("show");
    }
  };
}

const SITE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "pages", label: "Pages", count: true },
  { id: "health", label: "Health", count: true },
  { id: "members", label: "Members", count: true },
  { id: "settings", label: "Settings" },
];
let siteCtx = null;

async function viewSite(me, siteID, tab = "overview") {
  render(h(`${topnav(me, [{ label: "…" }])}<main class="view">${skeletonDetail()}</main>`));
  wireShell();

  let site, pages, members;
  let health = { summary: {}, bindings: [] };
  try {
    [site, pages, members, health] = await Promise.all([
      api("GET", `/api/v1/sites/${siteID}`),
      api("GET", `/api/v1/sites/${siteID}/pages`),
      api("GET", `/api/v1/sites/${siteID}/members`),
      api("GET", `/api/v1/sites/${siteID}/health`).catch(() => ({ summary: {}, bindings: [] })),
    ]);
  } catch (err) { return showError(err); }

  const server = location.origin;
  // Initial (loader = none) highlighted snippet; the configurator rebuilds it live.
  const snippetHTML = highlightSnippet(server, site.siteKey, { mode: "none" });

  const originsHTML = (site.origins || []).length
    ? (site.origins || []).map((o) => `
        <div class="row" style="padding:9px 0;border-bottom:1px solid var(--border)">
          <span class="grow mono" style="font-size:13px">${esc(o)}</span>
          <button class="icon-btn" data-remove-origin="${esc(o)}" aria-label="Remove ${esc(o)}">${ICON.trash}</button>
        </div>`).join("")
    : `<p class="faint" style="font-size:13px">No site URL yet. Add your live site's address to open the editor and verify the install.</p>`;

  const hsum = health.summary || {};
  const healthIssues = (hsum.at_risk || 0) + (hsum.broken || 0) + (hsum.quarantined || 0);
  const counts = { pages: pages.length, members: members.length, health: healthIssues };
  // Health is a problem surface, not a permanent tab — only show it when there's
  // actually something to fix. A clean site shouldn't advertise a health page.
  const visibleTabs = SITE_TABS.filter((t) => t.id !== "health" || healthIssues > 0);
  const tabsNav = `
    <div class="tabs" id="site-tabs" role="tablist" aria-label="Site sections">
      ${visibleTabs.map((t) => `<button class="tab" role="tab" id="tab-${t.id}" data-tab="${t.id}" aria-controls="panel-${t.id}" aria-selected="false" tabindex="-1">${t.label}${t.count ? `<span class="count">${counts[t.id]}</span>` : ""}</button>`).join("")}
      <span class="tab-ink" aria-hidden="true"></span>
    </div>`;

  const overviewPanel = `
    <section class="panel" role="tabpanel" data-panel="overview" id="panel-overview" aria-labelledby="tab-overview" tabindex="0" hidden>
      <div class="section-title"><h2>Open editor</h2></div>
      <div class="card"><div class="card-pad">
        ${alertBox("editor-err")}
        <div class="field" style="margin:0"><label for="edit-url">Page to edit <span class="faint">(defaults to your site URL — change the path to edit a specific page)</span></label>
          <input id="edit-url" placeholder="https://example.com/about" value="${esc((site.origins || [])[0] || "")}" /></div>
      </div>
      <div class="card-foot">
        <span class="note grow">Opens the page with a 4-hour edit token in the URL fragment.</span>
        <button class="btn btn-primary" id="edit-open">${ICON.external} Open editor</button>
      </div></div>

      <div class="section-title"><h2>Loading indicator</h2><span class="hint">Shown instantly while content loads — lives in the tag, no server round-trip</span></div>
      <div class="card"><div class="card-pad">
        <p class="muted" style="font-size:13px;margin-bottom:12px">With a remote database the manifest takes a moment to arrive. Pick a loader to show immediately — its config travels in the script tag, so it never waits on the network.</p>
        <div class="field"><label>Style</label>
          <div class="seg lseg" id="ldr-mode">
            <button type="button" data-m="none" class="on">None</button>
            <button type="button" data-m="bar">Top bar</button>
            <button type="button" data-m="overlay">Overlay</button>
            <button type="button" data-m="skeleton">Skeleton</button>
            <button type="button" data-m="custom">Custom</button>
          </div>
        </div>
        <div id="ldr-opts" class="ldr-opts"></div>
        <div class="ldr-preview" id="ldr-preview"></div>
      </div></div>

      <div class="section-title"><h2>Install</h2><span class="hint">Add to every page, ideally in &lt;head&gt;</span></div>
      <div class="card"><div class="card-pad">
        <p class="muted" style="font-size:13px;margin-bottom:12px">Tag elements with <code>data-weblay="name"</code> for flash-free, rename-proof editing. Untagged text and images are editable too.</p>
        <div class="snippet"><span id="snippet-code">${snippetHTML}</span><button class="icon-btn copy" id="copy-snippet" aria-label="Copy install snippet">${ICON.copy}</button></div>
        <div id="verify-result" class="verify-result" aria-live="polite"></div>
      </div>
      <div class="card-foot">
        <span class="note grow">${(site.origins || []).length ? `Checks <b>${esc((site.origins || [])[0])}</b> for the connector.` : "Add your site URL in Settings, then verify."}</span>
        <button class="btn btn-secondary" id="verify-install"${(site.origins || []).length ? "" : " disabled"}>${ICON.check} Verify installation</button>
      </div></div>

      <div class="section-title"><h2>Drift monitoring</h2><span class="hint">How Weblay notices when the live site changes</span></div>
      <div class="card"><div class="card-pad">
        <p class="muted" style="font-size:13px;margin-bottom:12px">Weblay checks your edits automatically on a schedule and whenever a visitor hits a broken one. For instant checks after a deploy, call the webhook below from your CI — or check on demand right now.</p>
        <div class="row" style="gap:10px;align-items:center;margin-bottom:14px">
          <button class="btn btn-secondary" id="check-now">${ICON.restore} Check now</button>
          <span class="note" id="check-now-note">Runs an authoritative crawl of your live pages and refreshes health.</span>
        </div>
        <div class="field" style="margin:0"><label>Deploy webhook <span class="faint">(call on every publish/deploy)</span></label>
          <div class="snippet"><span id="webhook-example" class="mono" style="font-size:12px">Loading…</span><button class="icon-btn copy" id="copy-webhook" aria-label="Copy webhook command">${ICON.copy}</button></div>
        </div>
      </div>
      <div class="card-foot">
        <span class="note grow">The secret authenticates the trigger. It can only re-crawl your own registered URLs.</span>
        <button class="btn btn-ghost sm" id="rotate-webhook">Rotate secret</button>
      </div></div>
    </section>`;

  const firstOrigin = (site.origins || [])[0] || "";
  const liveURL = (path) => (firstOrigin ? firstOrigin.replace(/\/$/, "") + path : "");
  const pageByPath = {};
  for (const p of pages) pageByPath[p.path] = p;
  const healthCtx = {
    liveURL,
    pageId: (path) => (pageByPath[path] ? pageByPath[path].id : ""),
    pageVersion: (path) => (pageByPath[path] ? pageByPath[path].publishedVersion : 0),
  };
  const pagesPanel = `
    <section class="panel" role="tabpanel" data-panel="pages" id="panel-pages" aria-labelledby="tab-pages" tabindex="0" hidden>
      <div class="card">
        ${pages.length === 0
          ? `<div class="empty"><div class="ei">${ICON.code}</div><h3>Nothing edited yet</h3><p>Open the editor and click any text or image to start.</p></div>`
          : `<div class="table-wrap"><table class="pages-table">
              <thead><tr><th>Path</th><th>Status</th><th>Last edited</th><th class="col-actions"></th></tr></thead>
              <tbody>${pages.map((p) => {
                const url = liveURL(p.path);
                const published = p.publishedVersion > 0;
                const when = p.draftUpdatedAt || p.createdAt;
                return `
                <tr class="page-row" data-page="${p.id}">
                  <td>${url
                    ? `<a class="path path-link" href="${esc(url)}" target="_blank" rel="noopener" title="Open live page">${esc(p.path)}${ICON.external}</a>`
                    : `<span class="path">${esc(p.path)}</span>`}</td>
                  <td class="status-cell">
                    ${published
                      ? `<span class="badge success" title="Published and live"><span class="dot"></span>Live · v${p.publishedVersion}</span>`
                      : `<span class="badge neutral" title="Never published"><span class="dot"></span>Draft only</span>`}
                    ${p.hasDraft ? `<span class="badge warn" title="Unpublished draft changes"><span class="dot"></span>Draft</span>` : ""}
                  </td>
                  <td class="muted num" title="${esc(new Date(when).toLocaleString())}">${esc(relTime(when))}</td>
                  <td class="t-actions">
                    ${p.hasDraft ? `
                      <button class="btn btn-primary sm" data-publish="${p.id}" data-path="${esc(p.path)}" title="Publish draft changes">${ICON.check} Publish</button>
                      <button class="btn btn-danger sm" data-discard="${p.id}" data-path="${esc(p.path)}" title="Discard unpublished changes">${ICON.trash} Discard</button>
                    ` : ""}
                    <button class="btn btn-ghost sm" data-edit-page="${p.id}" data-path="${esc(p.path)}"${firstOrigin ? "" : ' disabled title="Add an allowed origin in Settings first"'}>${ICON.logo} Edit</button>
                    <button class="btn btn-ghost sm" data-history="${p.id}" data-path="${esc(p.path)}" data-version="${p.publishedVersion}" data-hasdraft="${p.hasDraft ? 1 : 0}" data-draftat="${esc(p.draftUpdatedAt || "")}">${ICON.clock} History</button>
                    ${p.publishedVersion > 0 ? `<button class="btn btn-ghost sm" data-reset-page="${p.id}" data-path="${esc(p.path)}" title="Revert this page to original markup">${ICON.restore} Reset</button>` : ""}
                  </td>
                </tr>`;
              }).join("")}</tbody>
            </table></div>`}
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
      <div class="section-title"><h2>Site URLs</h2><span class="hint">Where the editor may run and where edits are verified</span></div>
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
        <div class="card-pad row wrap" style="border-bottom:1px solid var(--border)">
          <div class="grow"><div style="font-weight:600;font-size:14px">Reset all overrides</div><div class="faint" style="font-size:13px">Reverts every page to its original markup and publishes. Recoverable from each page's version history.</div></div>
          <button class="btn btn-danger" id="reset-site">${ICON.restore} Reset entire site</button>
        </div>
        <div class="card-pad row wrap">
          <div class="grow"><div style="font-weight:600;font-size:14px">Delete this site</div><div class="faint" style="font-size:13px">Removes all its content, revisions, and members. This cannot be undone.</div></div>
          <button class="btn btn-danger" id="delete-site">${ICON.trash} Delete site</button>
        </div>
      </div>
    </section>`;

  const healthPanel = healthIssues === 0 ? "" : `
    <section class="panel" role="tabpanel" data-panel="health" id="panel-health" aria-labelledby="tab-health" tabindex="0" hidden>
      <div class="section-title"><h2>Override health</h2><span class="hint">Drift detection across bind-time, crawl, and runtime</span></div>
      <div class="card"><div class="card-pad">
        <div class="row wrap" style="gap:8px;align-items:center">
          ${healthStat("Healthy", hsum.healthy || 0, "success")}
          ${healthStat("At risk", hsum.at_risk || 0, "warn")}
          ${healthStat("Broken", hsum.broken || 0, "danger")}
          ${healthStat("Quarantined", hsum.quarantined || 0, "danger")}
          <span class="grow"></span>
          <button class="btn btn-secondary sm" id="health-scan">${ICON.restore} Re-check now</button>
        </div>
      </div></div>
      <div id="health-list">${renderHealth(health.bindings || [], healthCtx)}</div>
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
      ${healthIssues > 0 ? `
        <div class="site-alert">
          <span class="sa-ico">${ICON.alert}</span>
          <div class="grow"><b>${healthIssues} override${healthIssues === 1 ? " needs" : "s need"} attention.</b>
            <span class="faint">Markup changes on the live site broke or moved some edits.</span></div>
          <button class="btn btn-secondary sm" id="goto-health">Review health</button>
        </div>` : ""}
      ${tabsNav}
      <div class="panels">${overviewPanel}${pagesPanel}${healthPanel}${membersPanel}${settingsPanel}</div>
    </main>
  `));
  wireShell();
  // Create the tab/site context up front so handlers wired below (live-sync,
  // Health auto-scan) can hang state off it before the tabs are activated.
  siteCtx = { id: siteID, currentTab: null };

  document.getElementById("copy-key").onclick = (e) => copyText(site.siteKey, e.currentTarget);

  // Health: re-check now (runs the drift crawler).
  const scanBtn = document.getElementById("health-scan");
  if (scanBtn) scanBtn.onclick = () => withLoading(scanBtn, async () => {
    try {
      const fresh = await api("POST", `/api/v1/sites/${siteID}/health/scan`, {});
      document.getElementById("health-list").innerHTML = renderHealth(fresh.bindings || [], healthCtx);
      wireHealthActions();
      toast("Drift re-check complete", { type: "success" });
    } catch (err) { showError(err); }
  });

  const gotoHealth = document.getElementById("goto-health");
  if (gotoHealth) gotoHealth.onclick = () => goTab("health");

  // All health-tab actions (re-render-safe: called on load + after each scan).
  function wireHealthActions() {
    for (const b of app.querySelectorAll("[data-harden]")) {
      b.onclick = () => {
        const { sel } = JSON.parse(b.dataset.harden);
        confirmModal({
          title: "Harden this override",
          body: `Add a stable <code>data-weblay</code> name to the element so it survives markup changes:<br><br>` +
                `<code style="display:block;background:#060606;padding:10px;border-radius:8px;font-size:12px">&lt;… data-weblay="my-name"&gt;</code><br>` +
                `Current selector: <code style="font-size:11px">${esc(sel)}</code><br><br>` +
                `Re-open the editor and re-save the element after tagging it.`,
          confirmLabel: "Got it",
        });
      };
    }
    for (const b of app.querySelectorAll("[data-rebind]")) {
      b.onclick = async () => {
        const { sel, path } = JSON.parse(b.dataset.rebind);
        try { await openEditor(liveURL(path || "/"), sel); }
        catch (err) { toast(err.message, { type: "error" }); }
      };
    }
    for (const b of app.querySelectorAll("[data-reset-el]")) {
      b.onclick = async () => {
        const { id, sel, path } = JSON.parse(b.dataset.resetEl);
        const ok = await confirmModal({
          title: `Reset this override on ${path || "/"}?`,
          body: `Removes this edit and publishes the original element live. Recoverable from the page's version history.`,
          confirmLabel: "Reset to original", danger: true,
        });
        if (!ok) return;
        try {
          await api("POST", `/api/v1/sites/${siteID}/pages/${id}/reset-element`, { selector: sel });
          toast("Override reset", { type: "success" }); route();
        } catch (err) { showError(err); }
      };
    }
    for (const b of app.querySelectorAll("[data-reset-page-health]")) {
      b.onclick = async () => {
        const path = b.dataset.path;
        const ok = await confirmModal({
          title: `Reset ${path} to original?`,
          body: `Removes <b>all</b> overrides on this page and publishes the new design as-is. Recoverable from version history.`,
          confirmLabel: "Reset page", danger: true,
        });
        if (!ok) return;
        try {
          await api("POST", `/api/v1/sites/${siteID}/pages/${b.dataset.resetPageHealth}/reset`, {});
          toast("Page reset to original", { type: "success" }); route();
        } catch (err) { showError(err); }
      };
    }
    for (const b of app.querySelectorAll("[data-health-history]")) {
      b.onclick = () => openHistoryDrawer(siteID, b.dataset.healthHistory, b.dataset.path, Number(b.dataset.version), { hasDraft: false, draftAt: null });
    }
  }
  wireHealthActions();
  // The snippet is rebuilt live by the loader configurator; copy its current value.
  const loaderState = wireLoaderConfigurator(server, site.siteKey);
  document.getElementById("copy-snippet").onclick = (e) => copyText(buildSnippet(server, site.siteKey, loaderState), e.currentTarget);

  // ---- Verify installation ----
  const verifyBtn = document.getElementById("verify-install");
  const verifyOut = document.getElementById("verify-result");
  if (verifyBtn) verifyBtn.onclick = () => withLoading(verifyBtn, async () => {
    try {
      const rep = await api("POST", `/api/v1/sites/${siteID}/verify-install`, {});
      const ok = rep.installed;
      const tone = ok ? "ok" : (rep.scriptFound ? "warn" : "bad");
      const icon = ok ? ICON.check : ICON.alert;
      verifyOut.className = `verify-result show ${tone}`;
      verifyOut.innerHTML = `<span class="vi">${icon}</span><span>${esc(rep.message)}${rep.url ? ` <span class="faint">(${esc(rep.url)})</span>` : ""}</span>`;
      toast(ok ? "Connector detected" : "Connector not detected", { type: ok ? "success" : "warn" });
    } catch (err) { showError(err); }
  });

  // ---- Drift monitoring: on-demand check (Fix A) ----
  const checkNowBtn = document.getElementById("check-now");
  if (checkNowBtn) checkNowBtn.onclick = () => withLoading(checkNowBtn, async () => {
    try {
      const fresh = await api("POST", `/api/v1/sites/${siteID}/health/scan`, {});
      const sum = fresh.summary || {};
      const issues = (sum.at_risk || 0) + (sum.broken || 0) + (sum.quarantined || 0);
      const note = document.getElementById("check-now-note");
      if (note) note.textContent = issues > 0
        ? `Found ${issues} override${issues === 1 ? " that needs" : "s that need"} attention.`
        : "All edits still resolve cleanly on the live site.";
      applyHealth(fresh);
      // Reveal the alert/Health tab (or clear it) via a focus-safe re-render.
      const sig = [sum.healthy || 0, sum.at_risk || 0, sum.broken || 0, sum.quarantined || 0].join("-");
      if (sig !== healthSig && !userBusy()) route();
      toast(issues > 0 ? `${issues} override${issues === 1 ? "" : "s"} need attention` : "No drift — all healthy", { type: issues > 0 ? "warn" : "success" });
    } catch (err) { showError(err); }
  });

  // ---- Deploy webhook (Fix B) ----
  let webhookExample = "";
  async function loadWebhook() {
    try {
      const wh = await api("GET", `/api/v1/sites/${siteID}/webhook`);
      webhookExample = wh.example || "";
      const el = document.getElementById("webhook-example");
      if (el) el.textContent = webhookExample;
    } catch { /* non-fatal */ }
  }
  loadWebhook();
  const copyWebhook = document.getElementById("copy-webhook");
  if (copyWebhook) copyWebhook.onclick = (e) => webhookExample && copyText(webhookExample, e.currentTarget);
  const rotateWebhook = document.getElementById("rotate-webhook");
  if (rotateWebhook) rotateWebhook.onclick = () => withLoading(rotateWebhook, async () => {
    try {
      const wh = await api("POST", `/api/v1/sites/${siteID}/webhook/rotate`, {});
      webhookExample = wh.example || "";
      const el = document.getElementById("webhook-example");
      if (el) el.textContent = webhookExample;
      toast("Webhook secret rotated — update your CI", { type: "success" });
    } catch (err) { showError(err); }
  });

  // ---- Live health sync ----
  // Refresh the on-screen health list from a fresh /health payload, in place.
  function applyHealth(health) {
    const hsum = health.summary || {};
    const list = document.getElementById("health-list");
    if (list) { list.innerHTML = renderHealth(health.bindings || [], healthCtx); wireHealthActions(); }
    return [hsum.healthy || 0, hsum.at_risk || 0, hsum.broken || 0, hsum.quarantined || 0].join("-");
  }
  let healthSig = [hsum.healthy || 0, hsum.at_risk || 0, hsum.broken || 0, hsum.quarantined || 0].join("-");
  // Run one authoritative crawl and refresh (used on Health-tab open + on demand).
  siteCtx.scanHealth = async () => {
    try {
      const fresh = await api("POST", `/api/v1/sites/${siteID}/health/scan`, {});
      const sig = applyHealth(fresh);
      if (sig !== healthSig && !userBusy()) { route(); } else { healthSig = sig; }
    } catch { /* transient; the poll will catch up */ }
  };
  // Poll every 15 s: drift found by the background crawler, on-site publishes, or
  // teammates' edits all surface here without a manual reload.
  healthPoll = setInterval(async () => {
    if (!location.hash.startsWith(`#/sites/${siteID}`)) { stopHealthPoll(); return; }
    let health;
    try { health = await api("GET", `/api/v1/sites/${siteID}/health`); } catch { return; }
    const sig = applyHealth(health);
    // A change in the status mix flips tabs/banners/badges — do a full, focus-safe
    // re-render so every surface (home badge, alert, tab count) stays consistent.
    if (sig !== healthSig && !userBusy()) { route(); return; }
    healthSig = sig;
  }, 15000);

  // Mints an edit token and opens the given URL in the editor (new tab). When
  // rebindSel is set, the editor opens in guided re-bind mode for that override.
  async function openEditor(rawURL, rebindSel) {
    const url = new URL(rawURL);
    if (!(site.origins || []).includes(url.origin)) {
      throw new Error(`${url.origin} is not in this site's allowed origins — add it first`);
    }
    const { token } = await api("POST", `/api/v1/sites/${siteID}/edit-token`, {});
    let frag = `#weblay=${token}`;
    if (rebindSel) frag += `&rebind=${encodeURIComponent(rebindSel)}`;
    window.open(`${url.href.split("#")[0]}${frag}`, "_blank");
    toast("Editor opened in a new tab", { type: "info" });
  }

  const editBtn = document.getElementById("edit-open");
  editBtn.onclick = () => withLoading(editBtn, async () => {
    try { await openEditor(val("edit-url")); }
    catch (err) { showError(err, "editor-err"); }
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

  // Per-page "Edit" — open this exact page in the editor.
  for (const btn of app.querySelectorAll("[data-edit-page]")) {
    btn.onclick = () => withLoading(btn, async () => {
      try { await openEditor(liveURL(btn.dataset.path)); }
      catch (err) { toast(err.message, { type: "error" }); }
    });
  }

  // Per-page "Publish" — publish the page's draft changes.
  for (const btn of app.querySelectorAll("[data-publish]")) {
    btn.onclick = () => withLoading(btn, async () => {
      try {
        const { version } = await api("POST", `/api/v1/sites/${siteID}/pages/${btn.dataset.publish}/publish`, {});
        toast(`Published — v${version} is live`, { type: "success", desc: btn.dataset.path });
        route();
      } catch (err) { showError(err); }
    });
  }

  // Per-page "Discard" — revert unpublished draft changes (confirmed).
  for (const btn of app.querySelectorAll("[data-discard]")) {
    btn.onclick = async () => {
      const ok = await confirmModal({
        title: `Discard draft on ${btn.dataset.path}?`,
        body: `This reverts <b>${esc(btn.dataset.path)}</b> to its last published version. Unpublished edits will be lost — published content stays live.`,
        confirmLabel: "Discard changes",
        danger: true,
      });
      if (!ok) return;
      try {
        await api("POST", `/api/v1/sites/${siteID}/pages/${btn.dataset.discard}/discard`, {});
        toast("Draft discarded", { type: "success" });
        route();
      } catch (err) { showError(err); }
    };
  }

  // Per-page "Reset" — revert the page to original markup (publishes).
  for (const btn of app.querySelectorAll("[data-reset-page]")) {
    btn.onclick = async () => {
      const ok = await confirmModal({
        title: `Reset ${btn.dataset.path} to original?`,
        body: `This removes all overrides on <b>${esc(btn.dataset.path)}</b> and publishes the original markup live. You can restore it from this page's version history.`,
        confirmLabel: "Reset to original", danger: true,
      });
      if (!ok) return;
      try {
        await api("POST", `/api/v1/sites/${siteID}/pages/${btn.dataset.resetPage}/reset`, {});
        toast("Page reset to original", { type: "success" });
        route();
      } catch (err) { showError(err); }
    };
  }

  // Per-page "History" — open a focused slide-over drawer with the revision timeline.
  for (const btn of app.querySelectorAll("[data-history]")) {
    btn.onclick = () => withLoading(btn, () =>
      openHistoryDrawer(siteID, btn.dataset.history, btn.dataset.path, Number(btn.dataset.version), {
        hasDraft: btn.dataset.hasdraft === "1",
        draftAt: btn.dataset.draftat || null,
      }));
  }

  const addMemberBtn = document.getElementById("add-member");
  addMemberBtn.onclick = () => withLoading(addMemberBtn, async () => {
    try {
      await api("POST", `/api/v1/sites/${siteID}/members`, { email: val("member-email"), role: document.getElementById("member-role").value });
      toast("Member added"); route();
    } catch (err) { showError(err, "member-err"); }
  });
  bindEnter(["member-email"], () => addMemberBtn.click());

  const resetSiteBtn = document.getElementById("reset-site");
  if (resetSiteBtn) resetSiteBtn.onclick = async () => {
    const ok = await confirmModal({
      title: `Reset all overrides on “${site.name}”?`,
      body: `This reverts <b>every page</b> to its original markup and publishes it live. Each page is recoverable from its version history.`,
      confirmLabel: "Reset entire site", danger: true,
    });
    if (!ok) return;
    await withLoading(resetSiteBtn, async () => {
      try {
        const res = await api("POST", `/api/v1/sites/${siteID}/reset`, {});
        toast(`Reset ${res.pages} page${res.pages === 1 ? "" : "s"} to original`, { type: "success" });
        route();
      } catch (err) { showError(err); }
    });
  };

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
  wireTabs();
  activateTab(SITE_TABS.some((t) => t.id === tab) ? tab : "overview");
  // Deep link straight to Health → run a fresh crawl immediately.
  if (tab === "health" && healthIssues > 0 && siteCtx.scanHealth) siteCtx.scanHealth();
}

// --- Tab controller ---

function activateTab(tab, { focus = false } = {}) {
  const list = document.getElementById("site-tabs");
  if (!list) return;
  // Validate against the tabs actually rendered (Health is hidden when clean),
  // so a deep link to a non-shown tab falls back to Overview instead of blank.
  const valid = list.querySelector(`.tab[data-tab="${tab}"]`) ? tab : "overview";
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
  // Opening Health kicks a fresh authoritative crawl so it always reflects the
  // live site the moment you look at it.
  if (tab === "health" && siteCtx.scanHealth) siteCtx.scanHealth();
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
