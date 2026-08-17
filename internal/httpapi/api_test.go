package httpapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/wolfigs/weblay/internal/config"
	"github.com/wolfigs/weblay/internal/store"
)

// harness spins up the full HTTP surface against a temp SQLite store.
type harness struct {
	t      *testing.T
	srv    *httptest.Server
	client *http.Client
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	cfg, err := config.Load(config.Options{DataDir: t.TempDir(), BaseURL: "http://weblay.test"})
	if err != nil {
		t.Fatal(err)
	}
	st, err := store.Open(cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })

	srv := httptest.NewServer(New(cfg, st, slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)), "test"))
	t.Cleanup(srv.Close)

	jar := &cookieJar{cookies: map[string]*http.Cookie{}}
	return &harness{t: t, srv: srv, client: &http.Client{Jar: jar}}
}

// cookieJar keeps session cookies across requests, keyed by name.
type cookieJar struct{ cookies map[string]*http.Cookie }

func (j *cookieJar) SetCookies(_ *url.URL, cs []*http.Cookie) {
	for _, c := range cs {
		j.cookies[c.Name] = c
	}
}
func (j *cookieJar) Cookies(_ *url.URL) []*http.Cookie {
	out := make([]*http.Cookie, 0, len(j.cookies))
	for _, c := range j.cookies {
		if c.MaxAge >= 0 && c.Value != "" {
			out = append(out, c)
		}
	}
	return out
}

func (h *harness) do(method, path string, body any, headers ...string) (*http.Response, map[string]any) {
	h.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			h.t.Fatal(err)
		}
	}
	req, err := http.NewRequest(method, h.srv.URL+path, &buf)
	if err != nil {
		h.t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	// Mirror the browser SPA: echo the readable CSRF cookie as a header on unsafe
	// methods (double-submit).
	if method != http.MethodGet && method != http.MethodHead {
		for _, c := range h.client.Jar.Cookies(req.URL) {
			if c.Name == csrfCookie {
				req.Header.Set(csrfHeader, c.Value)
			}
		}
	}
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	res, err := h.client.Do(req)
	if err != nil {
		h.t.Fatal(err)
	}
	defer res.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(res.Body).Decode(&out)
	return res, out
}

func (h *harness) expect(res *http.Response, want int, out map[string]any) map[string]any {
	h.t.Helper()
	if res.StatusCode != want {
		h.t.Fatalf("%s %s = %d, want %d (body: %v)", res.Request.Method, res.Request.URL.Path, res.StatusCode, want, out)
	}
	return out
}

func TestFullEditorialFlow(t *testing.T) {
	h := newHarness(t)

	// First run requires setup.
	res, out := h.do("GET", "/api/v1/status", nil)
	h.expect(res, 200, out)
	if out["needsSetup"] != true {
		t.Fatal("fresh server should need setup")
	}

	// Create the admin, which also signs us in.
	res, out = h.do("POST", "/api/v1/auth/setup", map[string]string{
		"email": "admin@example.com", "password": "hunter22222", "name": "Admin",
	})
	h.expect(res, 200, out)

	// Second setup attempt is rejected.
	res, out = h.do("POST", "/api/v1/auth/setup", map[string]string{
		"email": "evil@example.com", "password": "hackhackhack",
	})
	h.expect(res, 403, out)

	// Create a site with an allowed origin.
	res, out = h.do("POST", "/api/v1/sites", map[string]string{
		"name": "Demo", "origin": "https://demo.example.com",
	})
	h.expect(res, 201, out)
	siteID := out["id"].(string)
	siteKey := out["siteKey"].(string)

	// Issue an edit token (what the dashboard's Edit button does).
	res, out = h.do("POST", fmt.Sprintf("/api/v1/sites/%s/edit-token", siteID), map[string]string{})
	h.expect(res, 200, out)
	token := out["token"].(string)
	auth := []string{"Authorization", "Bearer " + token, "Origin", "https://demo.example.com"}

	// Editor verifies its session.
	res, out = h.do("GET", "/api/v1/edit/session", nil, auth...)
	h.expect(res, 200, out)

	// A wrong origin is refused even with a valid token.
	res, out = h.do("GET", "/api/v1/edit/session", nil,
		"Authorization", "Bearer "+token, "Origin", "https://evil.example.com")
	h.expect(res, 403, out)

	// Save a draft.
	res, out = h.do("PUT", "/api/v1/edit/content", map[string]any{
		"path":     "/about/",
		"selector": `[data-weblay="hero"]`,
		"content":  map[string]any{"text": "Welcome to Weblay"},
	}, auth...)
	h.expect(res, 200, out)

	// Manifest is still empty pre-publish (path normalization: /about/ → /about).
	res, out = h.do("GET", "/m/"+siteKey+"/manifest.json?path=/about", nil)
	h.expect(res, 200, out)
	if v := out["version"].(float64); v != 0 {
		t.Fatalf("pre-publish manifest version = %v, want 0", v)
	}

	// Publish.
	res, out = h.do("POST", "/api/v1/edit/publish", map[string]string{"path": "/about"}, auth...)
	h.expect(res, 200, out)
	if v := out["version"].(float64); v != 1 {
		t.Fatalf("publish version = %v, want 1", v)
	}

	// Manifest now serves the content with an ETag.
	req, _ := http.NewRequest("GET", h.srv.URL+"/m/"+siteKey+"/manifest.json?path=/about", nil)
	resp, err := h.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	etag := resp.Header.Get("ETag")
	if etag == "" {
		t.Fatal("manifest response missing ETag")
	}
	var manifest struct {
		Version  int `json:"version"`
		Elements map[string]struct {
			Text string `json:"text"`
		} `json:"elements"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&manifest); err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if manifest.Elements[`[data-weblay="hero"]`].Text != "Welcome to Weblay" {
		t.Fatalf("manifest content = %+v", manifest)
	}
	if v := resp.Header.Get("X-Weblay-Version"); v != "1" {
		t.Fatalf("X-Weblay-Version = %q, want 1", v)
	}

	// Versioned URL matching the current version is immutable-cacheable.
	req, _ = http.NewRequest("GET", h.srv.URL+"/m/"+siteKey+"/manifest.json?path=/about&v=1", nil)
	resp, err = h.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if cc := resp.Header.Get("Cache-Control"); !strings.Contains(cc, "immutable") {
		t.Fatalf("versioned (matching) Cache-Control = %q, want immutable", cc)
	}
	// A stale version is served no-cache so the caller self-corrects.
	req, _ = http.NewRequest("GET", h.srv.URL+"/m/"+siteKey+"/manifest.json?path=/about&v=999", nil)
	resp, err = h.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if cc := resp.Header.Get("Cache-Control"); cc != "no-cache" {
		t.Fatalf("versioned (stale) Cache-Control = %q, want no-cache", cc)
	}

	// Conditional GET returns 304.
	req, _ = http.NewRequest("GET", h.srv.URL+"/m/"+siteKey+"/manifest.json?path=/about", nil)
	req.Header.Set("If-None-Match", etag)
	resp, err = h.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotModified {
		t.Fatalf("conditional GET = %d, want 304", resp.StatusCode)
	}

	// Pages and revisions appear in the dashboard.
	res, _ = h.do("GET", fmt.Sprintf("/api/v1/sites/%s/pages", siteID), nil)
	if res.StatusCode != 200 {
		t.Fatalf("pages list = %d", res.StatusCode)
	}
}

func TestAuthRequired(t *testing.T) {
	h := newHarness(t)
	_, _ = h.do("POST", "/api/v1/auth/setup", map[string]string{
		"email": "admin@example.com", "password": "hunter22222",
	})

	// No token → edit API refuses.
	res, out := h.do("GET", "/api/v1/edit/session", nil)
	h.expect(res, 401, out)

	// Garbage token → refused.
	res, out = h.do("GET", "/api/v1/edit/session", nil, "Authorization", "Bearer deadbeef")
	h.expect(res, 401, out)

	// Unknown manifest key → 404.
	res, _ = h.do("GET", "/m/ilk_nonexistent/manifest.json?path=/", nil)
	if res.StatusCode != 404 {
		t.Fatalf("unknown site manifest = %d, want 404", res.StatusCode)
	}
}

func TestLoginFlow(t *testing.T) {
	h := newHarness(t)
	_, _ = h.do("POST", "/api/v1/auth/setup", map[string]string{
		"email": "admin@example.com", "password": "hunter22222",
	})
	_, _ = h.do("POST", "/api/v1/auth/logout", nil)

	res, out := h.do("GET", "/api/v1/me", nil)
	h.expect(res, 401, out)

	res, out = h.do("POST", "/api/v1/auth/login", map[string]string{
		"email": "admin@example.com", "password": "wrongwrong",
	})
	h.expect(res, 401, out)

	res, out = h.do("POST", "/api/v1/auth/login", map[string]string{
		"email": "Admin@Example.com", "password": "hunter22222",
	})
	h.expect(res, 200, out)

	res, out = h.do("GET", "/api/v1/me", nil)
	h.expect(res, 200, out)
	if out["email"] != "admin@example.com" {
		t.Fatalf("me = %v", out)
	}
}

func TestNormalizePath(t *testing.T) {
	cases := map[string]string{
		"":              "/",
		"/":             "/",
		"/about":        "/about",
		"/about/":       "/about",
		"about":         "/about",
		"/a/b/":         "/a/b",
		"/x?q=1":        "/x",
		"/x#frag":       "/x",
		"///":           "/",
	}
	for in, want := range cases {
		if got := normalizePath(in); got != want {
			t.Errorf("normalizePath(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestValidOrigin(t *testing.T) {
	valid := []string{"https://example.com", "http://localhost:3000", "https://sub.example.co.uk"}
	invalid := []string{"example.com", "https://example.com/path", "ftp://example.com", "https://example.com?q=1", ""}
	for _, o := range valid {
		if !validOrigin(o) {
			t.Errorf("validOrigin(%q) = false, want true", o)
		}
	}
	for _, o := range invalid {
		if validOrigin(o) {
			t.Errorf("validOrigin(%q) = true, want false", o)
		}
	}
}
