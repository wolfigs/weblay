package httpapi

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// metrics is a tiny, dependency-free collector exposed at /metrics in Prometheus
// text format. It tracks request counts per route+status and a latency histogram
// per route, plus process uptime — enough for request-rate, error-rate, and
// latency dashboards/alerts without pulling in a metrics library.
type metrics struct {
	mu      sync.Mutex
	started time.Time
	// counts[route][status] = n
	counts map[string]map[int]int64
	// latency histogram: buckets in milliseconds, cumulative counts per route.
	buckets []float64
	hist    map[string][]int64 // len == len(buckets)+1 (last = +Inf)
	sum     map[string]float64 // total observed ms, for an average
	total   map[string]int64
}

func newMetrics() *metrics {
	return &metrics{
		started: time.Now(),
		counts:  map[string]map[int]int64{},
		buckets: []float64{1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000},
		hist:    map[string][]int64{},
		sum:     map[string]float64{},
		total:   map[string]int64{},
	}
}

func (m *metrics) observe(route string, status int, dur time.Duration) {
	ms := float64(dur) / float64(time.Millisecond)
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.counts[route] == nil {
		m.counts[route] = map[int]int64{}
	}
	m.counts[route][status]++

	h := m.hist[route]
	if h == nil {
		h = make([]int64, len(m.buckets)+1)
		m.hist[route] = h
	}
	i := sort.SearchFloat64s(m.buckets, ms)
	h[i]++
	m.sum[route] += ms
	m.total[route]++
}

// routeLabel reduces a request to a low-cardinality label. Path parameters are
// collapsed to their template so IDs don't explode the metric space.
func routeLabel(r *http.Request) string {
	p := r.URL.Path
	switch {
	case strings.HasPrefix(p, "/m/"):
		return "GET /m/:siteKey/manifest.json"
	case strings.HasPrefix(p, "/a/"):
		return "GET /a/:asset"
	case strings.HasPrefix(p, "/t/"):
		return "POST /t/:siteKey"
	case strings.HasPrefix(p, "/hooks/"):
		return "POST /hooks/:siteKey/recrawl"
	case strings.HasPrefix(p, "/api/v1/edit/"):
		return r.Method + " /api/v1/edit/*"
	case strings.HasPrefix(p, "/api/v1/sites/"):
		return r.Method + " /api/v1/sites/*"
	case strings.HasPrefix(p, "/api/v1/"):
		return r.Method + " " + p
	default:
		return r.Method + " /"
	}
}

// statusRecorder captures the response status code for metrics.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (sr *statusRecorder) WriteHeader(code int) {
	sr.status = code
	sr.ResponseWriter.WriteHeader(code)
}

func (sr *statusRecorder) Write(b []byte) (int, error) {
	if sr.status == 0 {
		sr.status = http.StatusOK
	}
	return sr.ResponseWriter.Write(b)
}

// instrument wraps the mux to record per-request metrics.
func (s *Server) instrument(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/metrics" {
			s.handleMetrics(w, r)
			return
		}
		start := time.Now()
		sr := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(sr, r)
		if sr.status == 0 {
			sr.status = http.StatusOK
		}
		s.metrics.observe(routeLabel(r), sr.status, time.Since(start))
	})
}

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	m := s.metrics
	m.mu.Lock()
	defer m.mu.Unlock()

	var b strings.Builder
	b.WriteString("# HELP weblay_uptime_seconds Process uptime in seconds.\n")
	b.WriteString("# TYPE weblay_uptime_seconds gauge\n")
	fmt.Fprintf(&b, "weblay_uptime_seconds %.0f\n", time.Since(m.started).Seconds())

	b.WriteString("# HELP weblay_http_requests_total Total HTTP requests by route and status.\n")
	b.WriteString("# TYPE weblay_http_requests_total counter\n")
	for _, route := range sortedKeys(m.counts) {
		for _, status := range sortedIntKeys(m.counts[route]) {
			fmt.Fprintf(&b, "weblay_http_requests_total{route=%q,status=\"%d\"} %d\n",
				route, status, m.counts[route][status])
		}
	}

	b.WriteString("# HELP weblay_http_request_duration_ms Request latency histogram (ms).\n")
	b.WriteString("# TYPE weblay_http_request_duration_ms histogram\n")
	for _, route := range sortedKeys(m.hist) {
		h := m.hist[route]
		var cumulative int64
		for i, up := range m.buckets {
			cumulative += h[i]
			fmt.Fprintf(&b, "weblay_http_request_duration_ms_bucket{route=%q,le=%q} %d\n",
				route, strconv.FormatFloat(up, 'f', -1, 64), cumulative)
		}
		cumulative += h[len(h)-1]
		fmt.Fprintf(&b, "weblay_http_request_duration_ms_bucket{route=%q,le=\"+Inf\"} %d\n", route, cumulative)
		fmt.Fprintf(&b, "weblay_http_request_duration_ms_sum{route=%q} %.3f\n", route, m.sum[route])
		fmt.Fprintf(&b, "weblay_http_request_duration_ms_count{route=%q} %d\n", route, m.total[route])
	}

	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	_, _ = w.Write([]byte(b.String()))
}

func sortedKeys[V any](m map[string]V) []string {
	ks := make([]string, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	sort.Strings(ks)
	return ks
}

func sortedIntKeys[V any](m map[int]V) []int {
	ks := make([]int, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	sort.Ints(ks)
	return ks
}
