package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestMetricsObserveAndExpose(t *testing.T) {
	s := &Server{metrics: newMetrics()}
	s.metrics.observe("GET /api/v1/status", 200, 3*time.Millisecond)
	s.metrics.observe("GET /api/v1/status", 200, 40*time.Millisecond)
	s.metrics.observe("GET /api/v1/status", 500, 5*time.Millisecond)

	rr := httptest.NewRecorder()
	s.handleMetrics(rr, httptest.NewRequest("GET", "/metrics", nil))
	body := rr.Body.String()

	for _, want := range []string{
		`weblay_http_requests_total{route="GET /api/v1/status",status="200"} 2`,
		`weblay_http_requests_total{route="GET /api/v1/status",status="500"} 1`,
		`weblay_http_request_duration_ms_count{route="GET /api/v1/status"} 3`,
		`weblay_http_request_duration_ms_bucket{route="GET /api/v1/status",le="+Inf"} 3`,
		"weblay_uptime_seconds",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("metrics output missing %q\n%s", want, body)
		}
	}
}

func TestRouteLabelCollapsesIDs(t *testing.T) {
	cases := map[string]string{
		"/m/sk_abc/manifest.json":         "GET /m/:siteKey/manifest.json",
		"/api/v1/sites/xyz/health":        "GET /api/v1/sites/*",
		"/api/v1/edit/content":            "GET /api/v1/edit/*",
		"/a/asset123/pic.png":             "GET /a/:asset",
	}
	for path, want := range cases {
		r := httptest.NewRequest(http.MethodGet, path, nil)
		if got := routeLabel(r); got != want {
			t.Errorf("routeLabel(%q) = %q, want %q", path, got, want)
		}
	}
}
