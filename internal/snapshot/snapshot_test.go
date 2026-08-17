package snapshot

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExportRewritesPages(t *testing.T) {
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<!doctype html><html><head><title>t</title></head>` +
			`<body><h1 data-weblay="hero">ORIGINAL ` + r.URL.Path + `</h1></body></html>`))
	}))
	defer origin.Close()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Only the homepage has an edit.
		if r.URL.Query().Get("path") == "/" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"version":  1,
				"elements": map[string]any{`[data-weblay="hero"]`: map[string]any{"text": "EDITED HOME"}},
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	out := t.TempDir()
	results, err := Export(context.Background(), Config{Origin: origin.URL, Server: server.URL, SiteKey: "sk"},
		[]string{"/", "/about"}, out)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 2 {
		t.Fatalf("got %d results, want 2", len(results))
	}

	// Homepage: edited content written to index.html.
	home, err := os.ReadFile(filepath.Join(out, "index.html"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(home), "EDITED HOME") {
		t.Fatalf("homepage not rewritten:\n%s", home)
	}
	if !results[0].Edited {
		t.Error("homepage result should be marked Edited")
	}

	// /about: no manifest, so original content, written to about/index.html.
	about, err := os.ReadFile(filepath.Join(out, "about", "index.html"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(about), "ORIGINAL /about") {
		t.Fatalf("about page content lost:\n%s", about)
	}
	if results[1].Edited {
		t.Error("about result should not be marked Edited")
	}
}

func TestExportSkipsUnreachablePage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.NotFound(w, r) }))
	defer server.Close()
	results, err := Export(context.Background(),
		Config{Origin: "http://127.0.0.1:0", Server: server.URL, SiteKey: "sk"}, []string{"/"}, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Skipped == "" {
		t.Fatalf("expected a skipped result, got %+v", results)
	}
}
