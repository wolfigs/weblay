// Command weblay-e2e is a comprehensive black-box exercise of the running
// Weblay server. It creates a throwaway site, drives every endpoint and feature
// through the real HTTP API, asserts the responses, and prints a PASS/FAIL line
// per check. It cleans up the throwaway site at the end.
//
//	go run ./cmd/weblay-e2e
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"os"
	"strings"
)

const (
	base     = "http://localhost:8787"
	email    = "demo@wolfigs.dev"
	password = "demo-pass-1234"
	origin   = "http://localhost:5555" // the static demo, a registered-able origin
)

var (
	client        *http.Client
	pass, fail    int
	failures      []string
)

func main() {
	jar, _ := cookiejar.New(nil)
	client = &http.Client{Jar: jar}

	section("AUTH")
	authTests()

	section("SITE LIFECYCLE")
	siteID := siteTests()
	if siteID == "" {
		report()
		return
	}
	defer func() {
		// cleanup
		st, _ := do("DELETE", base+"/api/v1/sites/"+siteID, nil, nil)
		check("cleanup: delete throwaway site", st == 200, fmt.Sprintf("status %d", st))
		report()
	}()

	section("VERIFY INSTALL")
	verifyTests(siteID)

	section("CONTENT + PUBLISH (edit API)")
	token := editToken(siteID)
	contentTests(siteID, token)

	section("DASHBOARD PAGES / REVISIONS / RESET")
	pageTests(siteID)

	section("HEALTH + TELEMETRY")
	healthTests(siteID)

	section("MEMBERS")
	memberTests(siteID)

	section("UPLOAD")
	uploadTests(siteID, token)

	section("NEGATIVE / GUARDS")
	guardTests(siteID)
}

// ---------- test groups ----------

func authTests() {
	st, b := do("GET", base+"/api/v1/status", nil, nil)
	check("GET /status 200", st == 200, str(st, b))
	check("status has version", strings.Contains(string(b), "version"), string(b))

	st, _ = do("POST", base+"/api/v1/auth/login", nil, map[string]string{"email": email, "password": "wrong"})
	check("login wrong password rejected", st == 401 || st == 400, fmt.Sprintf("status %d", st))

	st, _ = do("POST", base+"/api/v1/auth/login", nil, map[string]string{"email": email, "password": password})
	check("login good password 200", st == 200, fmt.Sprintf("status %d", st))

	st, b = do("GET", base+"/api/v1/me", nil, nil)
	check("GET /me after login 200", st == 200, str(st, b))
}

func siteTests() string {
	// create
	st, b := do("POST", base+"/api/v1/sites", nil, map[string]string{"name": "E2E Throwaway", "origin": origin})
	check("create site 201", st == 201, str(st, b))
	var site struct {
		ID, SiteKey string
		Origins     []string
	}
	_ = json.Unmarshal(b, &site)
	check("create returns id+key", site.ID != "" && site.SiteKey != "", string(b))
	check("create attaches origin", len(site.Origins) == 1 && site.Origins[0] == origin, fmt.Sprintf("%v", site.Origins))

	// list includes it, issues=0
	st, b = do("GET", base+"/api/v1/sites", nil, nil)
	check("list sites 200", st == 200, str(st, b))
	var sites []map[string]any
	_ = json.Unmarshal(b, &sites)
	found := false
	for _, s := range sites {
		if s["id"] == site.ID {
			found = true
			check("new site issues == 0", toInt(s["issues"]) == 0, fmt.Sprintf("%v", s["issues"]))
		}
	}
	check("list contains new site", found, "")

	// get
	st, _ = do("GET", base+"/api/v1/sites/"+site.ID, nil, nil)
	check("GET site 200", st == 200, fmt.Sprintf("status %d", st))

	// origins add/remove
	st, _ = do("POST", base+"/api/v1/sites/"+site.ID+"/origins", nil, map[string]string{"origin": "https://staging.example.com"})
	check("add origin 201", st == 201, fmt.Sprintf("status %d", st))
	st, _ = do("DELETE", base+"/api/v1/sites/"+site.ID+"/origins", nil, map[string]string{"origin": "https://staging.example.com"})
	check("remove origin 200", st == 200, fmt.Sprintf("status %d", st))

	// invalid origin rejected
	st, _ = do("POST", base+"/api/v1/sites/"+site.ID+"/origins", nil, map[string]string{"origin": "not-a-url"})
	check("invalid origin rejected", st == 400, fmt.Sprintf("status %d", st))

	return site.ID
}

func verifyTests(siteID string) {
	// Default verify hits :5555, which HAS a weblay script but with the DEMO
	// site key, not this throwaway's — so scriptFound but key mismatch.
	st, b := do("POST", base+"/api/v1/sites/"+siteID+"/verify-install", nil, map[string]any{})
	check("verify-install 200", st == 200, str(st, b))
	var rep struct {
		Reachable, ScriptFound, SiteKeyMatch, Installed bool
		Message                                         string
	}
	_ = json.Unmarshal(b, &rep)
	check("verify: reachable", rep.Reachable, string(b))
	check("verify: script found on :5555", rep.ScriptFound, string(b))
	check("verify: key mismatch (not installed)", rep.ScriptFound && !rep.SiteKeyMatch && !rep.Installed, string(b))

	// Unregistered URL rejected (SSRF guard)
	st, _ = do("POST", base+"/api/v1/sites/"+siteID+"/verify-install", nil, map[string]string{"url": "http://evil.example.com/"})
	check("verify: unregistered URL rejected", st == 400, fmt.Sprintf("status %d", st))
}

func contentTests(siteID, token string) {
	if token == "" {
		check("edit-token issued", false, "no token")
		return
	}
	check("edit-token issued", true, "")
	bh := map[string]string{"Authorization": "Bearer " + token}

	// session
	st, b := do("GET", base+"/api/v1/edit/session", bh, nil)
	check("edit session 200", st == 200, str(st, b))

	// save a text draft
	body := map[string]any{
		"path": "/", "selector": `[data-weblay="hero-title"]`,
		"content":    map[string]any{"text": "E2E edited headline"},
		"descriptor": json.RawMessage(`{"v":1,"weblay":"hero-title","path":"[data-weblay=\"hero-title\"]","fp":{"tag":"H1","textHash":"","attrHash":"","landmark":"section"}}`),
		"risk":       map[string]any{"confidence": 100, "reasons": []string{}},
	}
	st, b = do("PUT", base+"/api/v1/edit/content", bh, body)
	check("PUT edit content 200", st == 200, str(st, b))

	// get drafts back
	st, b = do("GET", base+"/api/v1/edit/content?path=/", bh, nil)
	check("GET edit content 200", st == 200, str(st, b))
	check("draft persisted", strings.Contains(string(b), "E2E edited headline"), string(b))

	// publish
	st, b = do("POST", base+"/api/v1/edit/publish", bh, map[string]string{"path": "/"})
	check("edit publish 200", st == 200, str(st, b))
	var pub struct{ Version int }
	_ = json.Unmarshal(b, &pub)
	check("publish returns version >= 1", pub.Version >= 1, string(b))

	// manifest now serves the published edit (public endpoint)
	st, b = do("GET", base+"/m/"+siteKeyOf(siteID)+"/manifest.json?path=/", nil, nil)
	check("public manifest 200", st == 200, str(st, b))
	check("manifest contains edit", strings.Contains(string(b), "E2E edited headline"), string(b))

	// revisions list
	st, b = do("GET", base+"/api/v1/edit/revisions?path=/", bh, nil)
	check("edit revisions list 200", st == 200, str(st, b))

	// save a second draft then discard it
	body["content"] = map[string]any{"text": "second draft (to discard)"}
	do("PUT", base+"/api/v1/edit/content", bh, body)
	st, _ = do("POST", base+"/api/v1/edit/discard", bh, map[string]string{"path": "/"})
	check("edit discard 200", st == 200, fmt.Sprintf("status %d", st))
	st, b = do("GET", base+"/api/v1/edit/content?path=/", bh, nil)
	check("discard reverted to published", !strings.Contains(string(b), "second draft"), string(b))

	// reset the element
	st, _ = do("POST", base+"/api/v1/edit/reset-element", bh, map[string]string{"path": "/", "selector": `[data-weblay="hero-title"]`})
	check("edit reset-element 200", st == 200, fmt.Sprintf("status %d", st))
	st, b = do("GET", base+"/m/"+siteKeyOf(siteID)+"/manifest.json?path=/", nil, nil)
	check("manifest empty after reset", !strings.Contains(string(b), "E2E edited headline"), string(b))
}

func pageTests(siteID string) {
	// re-create an override so there's a page + revision to operate on
	token := editToken(siteID)
	bh := map[string]string{"Authorization": "Bearer " + token}
	body := map[string]any{
		"path": "/about/", "selector": `[data-weblay="about-heading"]`,
		"content": map[string]any{"text": "E2E about heading"},
		"risk":    map[string]any{"confidence": 100},
	}
	do("PUT", base+"/api/v1/edit/content", bh, body)
	do("POST", base+"/api/v1/edit/publish", bh, map[string]string{"path": "/about/"})

	st, b := do("GET", base+"/api/v1/sites/"+siteID+"/pages", nil, nil)
	check("dashboard pages list 200", st == 200, str(st, b))
	var pages []struct {
		ID, Path         string
		PublishedVersion int
	}
	_ = json.Unmarshal(b, &pages)
	// The server normalizes "/about/" -> "/about" on both write and manifest read,
	// so directory-style URLs resolve consistently. Assert the normalized form.
	check("trailing-slash path normalized to /about", anyPage(pages, "/about"), string(b))

	var pid string
	for _, p := range pages {
		if p.Path == "/about" {
			pid = p.ID
		}
	}
	if pid == "" {
		check("about page id resolved", false, "")
		return
	}
	// revisions
	st, b = do("GET", base+"/api/v1/sites/"+siteID+"/pages/"+pid+"/revisions", nil, nil)
	check("page revisions 200", st == 200, str(st, b))
	var revs []struct{ ID string }
	_ = json.Unmarshal(b, &revs)
	check("has >=1 revision", len(revs) >= 1, string(b))

	// restore a revision (creates a new revision)
	if len(revs) >= 1 {
		st, _ = do("POST", base+"/api/v1/sites/"+siteID+"/revisions/"+revs[0].ID+"/restore", nil, nil)
		check("revision restore 200", st == 200, fmt.Sprintf("status %d", st))
	}

	// reset-element (dashboard)
	st, _ = do("POST", base+"/api/v1/sites/"+siteID+"/pages/"+pid+"/reset-element", nil,
		map[string]string{"selector": `[data-weblay="about-heading"]`})
	check("dashboard page reset-element 200", st == 200, fmt.Sprintf("status %d", st))

	// page reset
	st, _ = do("POST", base+"/api/v1/sites/"+siteID+"/pages/"+pid+"/reset", nil, nil)
	check("dashboard page reset 200", st == 200, fmt.Sprintf("status %d", st))

	// site reset
	st, b = do("POST", base+"/api/v1/sites/"+siteID+"/reset", nil, nil)
	check("dashboard site reset 200", st == 200, str(st, b))
}

func healthTests(siteID string) {
	// seed an override so there's a binding
	token := editToken(siteID)
	bh := map[string]string{"Authorization": "Bearer " + token}
	body := map[string]any{
		"path": "/", "selector": `[data-weblay="hero-subtitle"]`,
		"content":    map[string]any{"text": "E2E subtitle"},
		"descriptor": json.RawMessage(`{"v":1,"weblay":"hero-subtitle","path":"[data-weblay=\"hero-subtitle\"]","fp":{"tag":"P","textHash":"x","attrHash":"","landmark":"section"}}`),
		"risk":       map[string]any{"confidence": 100},
	}
	do("PUT", base+"/api/v1/edit/content", bh, body)
	do("POST", base+"/api/v1/edit/publish", bh, map[string]string{"path": "/"})

	st, b := do("GET", base+"/api/v1/sites/"+siteID+"/health", nil, nil)
	check("health get 200", st == 200, str(st, b))
	check("health has summary", strings.Contains(string(b), "summary"), string(b))

	// scan (runs crawler against :5555)
	st, b = do("POST", base+"/api/v1/sites/"+siteID+"/health/scan", nil, map[string]any{})
	check("health scan 200", st == 200, str(st, b))

	// telemetry beacon (public)
	tel := map[string]any{"path": "/", "results": []map[string]string{
		{"sel": `[data-weblay="hero-subtitle"]`, "state": "found"},
	}}
	st, _ = do("POST", base+"/t/"+siteKeyOf(siteID), nil, tel)
	check("telemetry beacon accepted (204)", st == 204, fmt.Sprintf("status %d", st))

	// cleanup
	do("POST", base+"/api/v1/sites/"+siteID+"/reset", nil, nil)
}

func memberTests(siteID string) {
	st, b := do("GET", base+"/api/v1/sites/"+siteID+"/members", nil, nil)
	check("members list 200", st == 200, str(st, b))
	// adding a non-existent user should 404
	st, _ = do("POST", base+"/api/v1/sites/"+siteID+"/members", nil,
		map[string]string{"email": "nobody@nowhere.test", "role": "editor"})
	check("add unknown member 404", st == 404, fmt.Sprintf("status %d", st))
	// invalid role rejected
	st, _ = do("POST", base+"/api/v1/sites/"+siteID+"/members", nil,
		map[string]string{"email": email, "role": "superuser"})
	check("invalid role rejected", st == 400, fmt.Sprintf("status %d", st))
}

func uploadTests(siteID, token string) {
	bh := map[string]string{"Authorization": "Bearer " + token}
	// a 1x1 PNG
	png := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
		0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
		0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82}
	st, b, ct := multipartPost(base+"/api/v1/edit/upload", bh, "file", "px.png", png)
	check("image upload 201", st == 201, fmt.Sprintf("status %d ct=%s body=%s", st, ct, string(b)))
	var up struct{ URL string }
	_ = json.Unmarshal(b, &up)
	check("upload returns url", up.URL != "", string(b))
	if up.URL != "" {
		st, _ := do("GET", up.URL, nil, nil)
		check("uploaded asset served 200", st == 200, fmt.Sprintf("status %d", st))
	}
	// a non-image should be rejected
	st, _, _ = multipartPost(base+"/api/v1/edit/upload", bh, "file", "x.txt", []byte("not an image"))
	check("non-image upload rejected", st == 415 || st == 400, fmt.Sprintf("status %d", st))
}

func guardTests(siteID string) {
	// unauthenticated dashboard call after logout
	do("POST", base+"/api/v1/auth/logout", nil, nil)
	st, _ := do("GET", base+"/api/v1/sites", nil, nil)
	check("dashboard requires auth after logout", st == 401, fmt.Sprintf("status %d", st))
	// edit API without token
	st, _ = do("GET", base+"/api/v1/edit/session", nil, nil)
	check("edit API requires bearer", st == 401, fmt.Sprintf("status %d", st))
	// log back in so the deferred cleanup (delete site) is authorized
	do("POST", base+"/api/v1/auth/login", nil, map[string]string{"email": email, "password": password})
}

// ---------- helpers ----------

var siteKeyCache = map[string]string{}

func siteKeyOf(siteID string) string {
	if k, ok := siteKeyCache[siteID]; ok {
		return k
	}
	_, b := do("GET", base+"/api/v1/sites/"+siteID, nil, nil)
	var s struct{ SiteKey string }
	_ = json.Unmarshal(b, &s)
	siteKeyCache[siteID] = s.SiteKey
	return s.SiteKey
}

func editToken(siteID string) string {
	st, b := do("POST", base+"/api/v1/sites/"+siteID+"/edit-token", nil, map[string]any{})
	if st != 200 {
		return ""
	}
	var out struct{ Token string }
	_ = json.Unmarshal(b, &out)
	return out.Token
}

func do(method, url string, headers map[string]string, body any) (int, []byte) {
	var r io.Reader
	if body != nil {
		bb, _ := json.Marshal(body)
		r = bytes.NewReader(bb)
	}
	req, _ := http.NewRequest(method, url, r)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := client.Do(req)
	if err != nil {
		return 0, []byte(err.Error())
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, data
}

func multipartPost(url string, headers map[string]string, field, filename string, data []byte) (int, []byte, string) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, _ := mw.CreateFormFile(field, filename)
	fw.Write(data)
	mw.Close()
	req, _ := http.NewRequest("POST", url, &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := client.Do(req)
	if err != nil {
		return 0, []byte(err.Error()), ""
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, b, resp.Header.Get("Content-Type")
}

func anyPage(pages []struct {
	ID, Path         string
	PublishedVersion int
}, path string) bool {
	for _, p := range pages {
		if p.Path == path {
			return true
		}
	}
	return false
}

func toInt(v any) int {
	if f, ok := v.(float64); ok {
		return int(f)
	}
	return 0
}

func str(st int, b []byte) string { return fmt.Sprintf("status %d body %s", st, truncate(string(b), 160)) }
func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n] + "…"
	}
	return s
}

func section(name string) { fmt.Printf("\n── %s ──\n", name) }

func check(name string, ok bool, detail string) {
	if ok {
		pass++
		fmt.Printf("  ✓ %s\n", name)
	} else {
		fail++
		failures = append(failures, name+"  ["+detail+"]")
		fmt.Printf("  ✗ %s   %s\n", name, detail)
	}
}

func report() {
	fmt.Printf("\n══════════ %d passed, %d failed ══════════\n", pass, fail)
	if fail > 0 {
		fmt.Println("FAILURES:")
		for _, f := range failures {
			fmt.Println("  -", f)
		}
		os.Exit(1)
	}
}
