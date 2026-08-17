package drift

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"golang.org/x/net/html"
)

// csrPage is a single-page-application shell: the initial HTML contains only an
// empty root and a script that injects the real content after load. A static
// fetch therefore sees no data-weblay elements; only a rendering pass does.
const csrPage = `<!doctype html><html><head><meta charset="utf-8"><title>CSR</title></head>
<body><div id="root"></div>
<script>
  document.getElementById('root').innerHTML =
    '<section><h1 data-weblay="csr-title">Client-rendered heading</h1>' +
    '<p data-weblay="csr-body">Injected by JavaScript after load.</p></section>';
</script></body></html>`

func findByWeblay(root *html.Node, name string) *html.Node {
	for _, n := range elements(root) {
		if attr(n, "data-weblay") == name {
			return n
		}
	}
	return nil
}

// TestRenderingChannelResolvesCSR verifies that a descriptor which cannot be
// resolved against the static HTML of a client-rendered page is resolved after
// the headless rendering pass. Skips automatically if no Chrome is available.
func TestRenderingChannelResolvesCSR(t *testing.T) {
	if chromeExecPath() == "" {
		t.Skip("no Chrome/Chromium binary available for the rendering channel")
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(csrPage))
	}))
	defer srv.Close()

	c := New(nil, slog.Default())

	// Static fetch: the injected element is absent from the initial HTML.
	staticDoc, err := c.fetch(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("static fetch: %v", err)
	}
	if findByWeblay(staticDoc, "csr-title") != nil {
		t.Fatal("static HTML unexpectedly contained the client-rendered element")
	}

	// Rendering pass: the element must now be present. Build its descriptor here
	// so path and fingerprint match the live (rendered) element.
	rdoc, err := c.renderFetch(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("render fetch: %v", err)
	}
	n := findByWeblay(rdoc, "csr-title")
	if n == nil {
		t.Fatal("rendering pass did not expose the injected element")
	}
	d := BuildDescriptorJSON(n)

	// The descriptor must NOT resolve to a live element against the static DOM,
	// but MUST resolve healthy against the rendered DOM.
	if rs := Resolve(staticDoc, d); rs.Status == statusHealthy {
		t.Fatalf("static fetch unexpectedly resolved a client-rendered element: %+v", rs)
	}
	if rr := Resolve(rdoc, d); rr.Status != statusHealthy {
		t.Fatalf("rendering channel failed to resolve the element: %+v", rr)
	}
}
