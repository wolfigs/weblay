package edge

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
)

// A full round-trip: browser -> edge proxy -> origin, with the manifest fetched
// from a fake Weblay server. The proxied HTML must contain the edited content.
func TestProxyRewritesHTMLFromOrigin(t *testing.T) {
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(w, `<!doctype html><html><head><title>t</title></head>`+
			`<body><h1 data-weblay="hero">Original</h1></body></html>`)
	}))
	defer origin.Close()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/m/sk_test/manifest.json" {
			http.NotFound(w, r)
			return
		}
		if got := r.URL.Query().Get("path"); got != "/" {
			t.Errorf("manifest fetched for path %q, want /", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"version": 1,
			"elements": map[string]any{
				`[data-weblay="hero"]`: map[string]any{"text": "Edited by SSR"},
			},
		})
	}))
	defer server.Close()

	proxy := newTestProxy(t, origin.URL, server.URL)
	front := httptest.NewServer(proxy)
	defer front.Close()

	resp, err := http.Get(front.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	out := string(body)

	if !strings.Contains(out, "Edited by SSR") {
		t.Fatalf("proxied HTML missing edited content:\n%s", out)
	}
	if strings.Contains(out, "Original") {
		t.Fatalf("proxied HTML still contains original content:\n%s", out)
	}
	if resp.Header.Get("X-Weblay-SSR") != "1" {
		t.Errorf("expected X-Weblay-SSR: 1 header on a rewritten page")
	}
}

// Non-HTML responses (assets, JSON APIs) must pass through byte-for-byte.
func TestProxyPassesThroughNonHTML(t *testing.T) {
	const payload = `{"ok":true,"data":[1,2,3]}`
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, payload)
	}))
	defer origin.Close()

	// Manifest server that should never be consulted for non-HTML.
	var manifestHits int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&manifestHits, 1)
		http.NotFound(w, r)
	}))
	defer server.Close()

	front := httptest.NewServer(newTestProxy(t, origin.URL, server.URL))
	defer front.Close()

	resp, err := http.Get(front.URL + "/api/data")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if string(body) != payload {
		t.Fatalf("non-HTML body altered: got %q", body)
	}
	if atomic.LoadInt32(&manifestHits) != 0 {
		t.Errorf("manifest was fetched for a non-HTML response")
	}
}

// A page with no manifest (server 404) is served unchanged, not broken.
func TestProxyServesOriginWhenNoManifest(t *testing.T) {
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = io.WriteString(w, `<html><body><p>plain page</p></body></html>`)
	}))
	defer origin.Close()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r) // no edits for this site/path
	}))
	defer server.Close()

	front := httptest.NewServer(newTestProxy(t, origin.URL, server.URL))
	defer front.Close()

	resp, err := http.Get(front.URL + "/about")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "plain page") {
		t.Fatalf("origin content lost when no manifest: %s", body)
	}
	if resp.Header.Get("X-Weblay-SSR") == "1" {
		t.Errorf("X-Weblay-SSR set despite no manifest")
	}
}

// The manifest is cached: a second request for the same path does not refetch.
func TestManifestCached(t *testing.T) {
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = io.WriteString(w, `<html><body><h1 data-weblay="h">o</h1></body></html>`)
	}))
	defer origin.Close()

	var fetches int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&fetches, 1)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"version":  1,
			"elements": map[string]any{`[data-weblay="h"]`: map[string]any{"text": "e"}},
		})
	}))
	defer server.Close()

	front := httptest.NewServer(newTestProxy(t, origin.URL, server.URL))
	defer front.Close()

	for i := 0; i < 3; i++ {
		resp, err := http.Get(front.URL + "/")
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
	}
	if n := atomic.LoadInt32(&fetches); n != 1 {
		t.Fatalf("manifest fetched %d times, want 1 (cache miss)", n)
	}
}

func newTestProxy(t *testing.T, originURL, serverURL string) *Proxy {
	t.Helper()
	ou, err := url.Parse(originURL)
	if err != nil {
		t.Fatal(err)
	}
	p, err := New(Config{Origin: ou, Server: serverURL, SiteKey: "sk_test"})
	if err != nil {
		t.Fatal(err)
	}
	return p
}
