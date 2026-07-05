// Inlay dashboard — a deliberately small vanilla-JS app. Views: setup, login,
// sites, site detail (install snippet, origins, members, pages, revisions).

"use strict";

const app = document.getElementById("app");

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

// --- Tiny render helpers ---

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

function showError(err, boxId = "err") {
  const box = document.getElementById(boxId);
  if (box) {
    box.textContent = err.message;
    box.style.display = "block";
  }
}

// --- Router ---

async function route() {
  try {
    const status = await api("GET", "/api/v1/status");
    if (status.needsSetup) return viewSetup();
    const me = await api("GET", "/api/v1/me").catch(() => null);
    if (!me) return viewLogin();

    const m = location.hash.match(/^#\/sites\/([a-f0-9]+)$/);
    if (m) return viewSite(me, m[1]);
    return viewSites(me);
  } catch (err) {
    render(h(`<div class="center-page"><div class="error-box">Cannot reach the Inlay server: ${esc(err.message)}</div></div>`));
  }
}

window.addEventListener("hashchange", route);

// --- Views ---

function viewSetup() {
  render(h(`
    <div class="center-page">
      <h1><span class="logo">INLAY</span></h1>
      <p class="muted">First run — create the admin account</p>
      <div class="card">
        <div class="error-box" id="err" style="display:none"></div>
        <label>Name</label><input id="name" autocomplete="name" />
        <label>Email</label><input id="email" type="email" autocomplete="email" />
        <label>Password (min 8 characters)</label><input id="password" type="password" autocomplete="new-password" />
        <div style="margin-top:18px"><button id="go" style="width:100%">Create account</button></div>
      </div>
    </div>
  `));
  document.getElementById("go").onclick = async () => {
    try {
      await api("POST", "/api/v1/auth/setup", {
        name: val("name"), email: val("email"), password: val("password"),
      });
      location.hash = "";
      route();
    } catch (err) { showError(err); }
  };
}

function viewLogin() {
  render(h(`
    <div class="center-page">
      <h1><span class="logo">INLAY</span></h1>
      <p class="muted">Sign in to your dashboard</p>
      <div class="card">
        <div class="error-box" id="err" style="display:none"></div>
        <label>Email</label><input id="email" type="email" autocomplete="email" />
        <label>Password</label><input id="password" type="password" autocomplete="current-password" />
        <div style="margin-top:18px"><button id="go" style="width:100%">Sign in</button></div>
      </div>
    </div>
  `));
  const submit = async () => {
    try {
      await api("POST", "/api/v1/auth/login", { email: val("email"), password: val("password") });
      route();
    } catch (err) { showError(err); }
  };
  document.getElementById("go").onclick = submit;
  document.getElementById("password").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

async function viewSites(me) {
  const sites = await api("GET", "/api/v1/sites");
  render(h(`
    <div class="topbar">
      <h1><span class="logo">INLAY</span></h1>
      <span class="muted right">${esc(me.email)}</span>
      <button class="ghost small" id="logout">Sign out</button>
    </div>

    <h2>Your sites</h2>
    ${sites.length === 0 ? `<p class="muted">No sites yet — connect your first one below.</p>` : ""}
    ${sites.map((s) => `
      <div class="card row">
        <div class="grow">
          <strong>${esc(s.name)}</strong><br/>
          <small class="muted">${esc(s.siteKey)} · ${esc((s.origins || []).join(", ") || "no origins yet")}</small>
        </div>
        <a href="#/sites/${s.id}"><button class="ghost small">Open</button></a>
      </div>
    `).join("")}

    <h2>Connect a site</h2>
    <div class="card">
      <div class="error-box" id="err" style="display:none"></div>
      <div class="row">
        <div class="grow"><label>Site name</label><input id="site-name" placeholder="Marketing site" /></div>
        <div class="grow"><label>Origin</label><input id="site-origin" placeholder="https://example.com" /></div>
      </div>
      <div style="margin-top:14px"><button id="create">Create site</button></div>
    </div>
  `));
  document.getElementById("logout").onclick = async () => {
    await api("POST", "/api/v1/auth/logout");
    route();
  };
  document.getElementById("create").onclick = async () => {
    try {
      const site = await api("POST", "/api/v1/sites", {
        name: val("site-name"),
        origin: val("site-origin").replace(/\/$/, ""),
      });
      location.hash = `#/sites/${site.id}`;
    } catch (err) { showError(err); }
  };
}

async function viewSite(me, siteID) {
  const [site, pages, members] = await Promise.all([
    api("GET", `/api/v1/sites/${siteID}`),
    api("GET", `/api/v1/sites/${siteID}/pages`),
    api("GET", `/api/v1/sites/${siteID}/members`),
  ]);
  const server = location.origin;

  render(h(`
    <div class="topbar">
      <a class="crumb" href="#">&larr; Sites</a>
      <h1>${esc(site.name)}</h1>
    </div>

    <h2>Install</h2>
    <div class="card">
      <p class="muted" style="margin-top:0">Add this to every page, ideally in <code>&lt;head&gt;</code>. Tag elements with <code>data-inlay="name"</code> for flash-free, rename-proof editing.</p>
      <div class="snippet">&lt;script src="${esc(server)}/inlay.js" data-site="${esc(site.siteKey)}"&gt;&lt;/script&gt;</div>
    </div>

    <h2>Edit your site</h2>
    <div class="card row">
      <div class="grow">
        <label>Page URL to open in edit mode</label>
        <input id="edit-url" placeholder="https://example.com/about" value="${esc((site.origins || [])[0] || "")}" />
      </div>
      <div><button id="edit-open" style="margin-top:26px">Open editor</button></div>
    </div>

    <h2>Allowed origins</h2>
    <div class="card">
      <div class="error-box" id="err" style="display:none"></div>
      ${(site.origins || []).map((o) => `
        <div class="row" style="padding:6px 0">
          <span class="grow">${esc(o)}</span>
          <button class="danger small" data-remove-origin="${esc(o)}">Remove</button>
        </div>
      `).join("") || `<p class="muted">No origins yet. The editor only works from origins listed here.</p>`}
      <div class="row" style="margin-top:10px">
        <div class="grow"><input id="new-origin" placeholder="https://example.com" /></div>
        <button class="ghost" id="add-origin">Add origin</button>
      </div>
    </div>

    <h2>Pages</h2>
    <div class="card">
      ${pages.length === 0 ? `<p class="muted" style="margin:0">Nothing edited yet. Open the editor and click any text.</p>` : `
        <table>
          <tr><th>Path</th><th>Published version</th><th></th></tr>
          ${pages.map((p) => `
            <tr>
              <td>${esc(p.path)}</td>
              <td><span class="pill">v${p.publishedVersion}</span></td>
              <td><button class="ghost small" data-revisions="${p.id}" data-path="${esc(p.path)}">History</button></td>
            </tr>
          `).join("")}
        </table>
        <div id="revisions"></div>
      `}
    </div>

    <h2>Members</h2>
    <div class="card">
      <div class="error-box" id="member-err" style="display:none"></div>
      <table>
        <tr><th>Email</th><th>Name</th><th>Role</th></tr>
        ${members.map((m) => `<tr><td>${esc(m.email)}</td><td>${esc(m.name)}</td><td><span class="pill">${esc(m.role)}</span></td></tr>`).join("")}
      </table>
      <div class="row" style="margin-top:12px">
        <div class="grow"><input id="member-email" placeholder="teammate@example.com" /></div>
        <select id="member-role" style="width:auto"><option value="editor">Editor</option><option value="owner">Owner</option></select>
        <button class="ghost" id="add-member">Add member</button>
      </div>
      <p class="muted" style="margin-bottom:0"><small>Members must already have an account on this Inlay server.</small></p>
    </div>

    <h2>Danger zone</h2>
    <div class="card row">
      <span class="grow muted">Deleting a site removes all its content and revisions.</span>
      <button class="danger" id="delete-site">Delete site</button>
    </div>
  `));

  document.getElementById("edit-open").onclick = async () => {
    try {
      const url = new URL(val("edit-url"));
      if (!(site.origins || []).includes(url.origin)) {
        throw new Error(`${url.origin} is not in this site's allowed origins — add it first`);
      }
      const { token } = await api("POST", `/api/v1/sites/${siteID}/edit-token`, {});
      window.open(`${url.href.split("#")[0]}#inlay=${token}`, "_blank");
    } catch (err) { showError(err); }
  };

  document.getElementById("add-origin").onclick = async () => {
    try {
      await api("POST", `/api/v1/sites/${siteID}/origins`, { origin: val("new-origin").replace(/\/$/, "") });
      route();
    } catch (err) { showError(err); }
  };
  for (const btn of app.querySelectorAll("[data-remove-origin]")) {
    btn.onclick = async () => {
      await api("DELETE", `/api/v1/sites/${siteID}/origins`, { origin: btn.dataset.removeOrigin });
      route();
    };
  }

  for (const btn of app.querySelectorAll("[data-revisions]")) {
    btn.onclick = async () => {
      const revs = await api("GET", `/api/v1/sites/${siteID}/pages/${btn.dataset.revisions}/revisions`);
      const target = document.getElementById("revisions");
      target.replaceChildren(h(`
        <h2 style="margin-top:18px">History — ${esc(btn.dataset.path)}</h2>
        ${revs.length === 0 ? `<p class="muted">No published revisions yet.</p>` : `
          <table>
            <tr><th>Version</th><th>Published</th><th></th></tr>
            ${revs.map((r) => `
              <tr>
                <td><span class="pill">v${r.version}</span></td>
                <td>${new Date(r.publishedAt).toLocaleString()}</td>
                <td><button class="ghost small" data-restore="${r.id}">Restore</button></td>
              </tr>
            `).join("")}
          </table>
        `}
      `));
      for (const rbtn of target.querySelectorAll("[data-restore]")) {
        rbtn.onclick = async () => {
          const rev = await api("POST", `/api/v1/sites/${siteID}/revisions/${rbtn.dataset.restore}/restore`, {});
          alert(`Restored — now live as version ${rev.version}`);
          route();
        };
      }
    };
  }

  document.getElementById("add-member").onclick = async () => {
    try {
      await api("POST", `/api/v1/sites/${siteID}/members`, {
        email: val("member-email"),
        role: document.getElementById("member-role").value,
      });
      route();
    } catch (err) { showError(err, "member-err"); }
  };

  document.getElementById("delete-site").onclick = async () => {
    if (!confirm(`Delete "${site.name}" and all its content? This cannot be undone.`)) return;
    await api("DELETE", `/api/v1/sites/${siteID}`);
    location.hash = "";
  };
}

function val(id) {
  return document.getElementById(id).value.trim();
}

route();
