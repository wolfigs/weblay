package drift

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func serve(html string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(html))
	}))
}

func TestCheckInstallDetected(t *testing.T) {
	srv := serve(`<html><head><script src="https://x/weblay.js" data-site="KEY123"></script></head><body>hi</body></html>`)
	defer srv.Close()
	rep := CheckInstall(context.Background(), srv.Client(), srv.URL, "KEY123")
	if !rep.Installed || !rep.ScriptFound || !rep.SiteKeyMatch {
		t.Fatalf("want installed, got %+v", rep)
	}
}

func TestCheckInstallWrongKey(t *testing.T) {
	srv := serve(`<html><body><script src="/weblay.js" data-site="OTHER"></script></body></html>`)
	defer srv.Close()
	rep := CheckInstall(context.Background(), srv.Client(), srv.URL, "KEY123")
	if rep.Installed || !rep.ScriptFound || rep.SiteKeyMatch {
		t.Fatalf("want script-found/key-mismatch, got %+v", rep)
	}
}

func TestCheckInstallNoScript(t *testing.T) {
	srv := serve(`<html><body><h1>plain page</h1></body></html>`)
	defer srv.Close()
	rep := CheckInstall(context.Background(), srv.Client(), srv.URL, "KEY123")
	if rep.Installed || rep.ScriptFound {
		t.Fatalf("want no-script, got %+v", rep)
	}
	if !rep.Reachable {
		t.Fatalf("want reachable true, got %+v", rep)
	}
}

func TestCheckInstallUnreachable(t *testing.T) {
	rep := CheckInstall(context.Background(), &http.Client{}, "http://127.0.0.1:0/", "KEY123")
	if rep.Reachable || rep.Installed {
		t.Fatalf("want unreachable, got %+v", rep)
	}
}
