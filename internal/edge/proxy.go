// Package edge is a reverse proxy that makes Weblay edits SEO-correct for any
// stack, with zero application code. It forwards each request to the origin and,
// for HTML responses, applies the page's published manifest server-side (via
// internal/ssr) so crawlers and social-preview bots — which never run
// JavaScript — receive the edited content in the first byte.
//
// It is the shipped implementation of the "reverse proxy" delivery mode in
// docs/seo.md. The same internal/ssr core also backs framework-middleware and
// CDN-worker modes.
package edge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wolfigs/weblay/internal/ssr"
)

// Config configures the edge proxy.
type Config struct {
	Origin      *url.URL      // upstream that serves the real pages (required)
	Server      string        // Weblay server base URL, e.g. https://api.weblay.app (required)
	SiteKey     string        // the site's public key (required)
	ManifestTTL time.Duration // manifest cache lifetime (default 30s)
	Client      *http.Client  // used for manifest fetches (default: 5s timeout)
	Log         *slog.Logger
}

// Proxy is an http.Handler that reverse-proxies to the origin and rewrites HTML.
type Proxy struct {
	cfg   Config
	rp    *httputil.ReverseProxy
	cache *manifestCache
}

// New builds a Proxy from cfg, validating the required fields.
func New(cfg Config) (*Proxy, error) {
	if cfg.Origin == nil {
		return nil, fmt.Errorf("edge: Origin is required")
	}
	if cfg.Server == "" || cfg.SiteKey == "" {
		return nil, fmt.Errorf("edge: Server and SiteKey are required")
	}
	if cfg.ManifestTTL <= 0 {
		cfg.ManifestTTL = 30 * time.Second
	}
	if cfg.Client == nil {
		cfg.Client = &http.Client{Timeout: 5 * time.Second}
	}
	if cfg.Log == nil {
		cfg.Log = slog.Default()
	}
	cfg.Server = strings.TrimRight(cfg.Server, "/")

	p := &Proxy{cfg: cfg, cache: newManifestCache()}
	p.rp = &httputil.ReverseProxy{
		Director:       p.director,
		ModifyResponse: p.modifyResponse,
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			cfg.Log.Warn("edge upstream error", "path", r.URL.Path, "err", err)
			http.Error(w, "upstream unavailable", http.StatusBadGateway)
		},
	}
	return p, nil
}

func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) { p.rp.ServeHTTP(w, r) }

// director rewrites the outbound request to target the origin. It forces an
// identity encoding so the HTML body is rewritable (no gzip round-trip).
func (p *Proxy) director(r *http.Request) {
	r.URL.Scheme = p.cfg.Origin.Scheme
	r.URL.Host = p.cfg.Origin.Host
	r.Host = p.cfg.Origin.Host
	if p.cfg.Origin.Path != "" && p.cfg.Origin.Path != "/" {
		r.URL.Path = singleJoin(p.cfg.Origin.Path, r.URL.Path)
	}
	r.Header.Set("Accept-Encoding", "identity")
	// Identify the proxy to the origin (useful for the origin's own logging).
	r.Header.Set("X-Forwarded-Host", r.Header.Get("Host"))
}

// modifyResponse rewrites HTML responses with the page's manifest. Non-HTML and
// bodiless responses pass through untouched.
func (p *Proxy) modifyResponse(resp *http.Response) error {
	if resp.Body == nil || resp.StatusCode == http.StatusNoContent || resp.StatusCode == http.StatusNotModified {
		return nil
	}
	if !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/html") {
		return nil
	}

	body, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		return err
	}

	path := normalizePath(resp.Request.URL.Path)
	m := p.manifestFor(resp.Request.Context(), path)

	out, err := ssr.Rewrite(body, m)
	if err != nil {
		// Rewrite already returns the original bytes on failure; keep serving.
		p.cfg.Log.Warn("edge rewrite failed; serving origin HTML", "path", path, "err", err)
		out = body
	}

	resp.Body = io.NopCloser(bytes.NewReader(out))
	resp.ContentLength = int64(len(out))
	resp.Header.Set("Content-Length", strconv.Itoa(len(out)))
	resp.Header.Del("Content-Encoding") // body is now identity-encoded
	if m != nil && len(m.Elements) > 0 {
		resp.Header.Set("X-Weblay-SSR", "1")
	}
	return nil
}

// manifestFor returns the (cached) manifest for a page path, or nil when the
// page has no edits or the fetch fails — in which case the origin HTML is served
// unchanged. Negative results are cached too, to avoid hammering the server.
func (p *Proxy) manifestFor(ctx context.Context, path string) *ssr.Manifest {
	if m, ok := p.cache.get(path, p.cfg.ManifestTTL); ok {
		return m
	}
	m := p.fetchManifest(ctx, path)
	p.cache.set(path, m)
	return m
}

func (p *Proxy) fetchManifest(ctx context.Context, path string) *ssr.Manifest {
	u := fmt.Sprintf("%s/m/%s/manifest.json?path=%s",
		p.cfg.Server, url.PathEscape(p.cfg.SiteKey), url.QueryEscape(path))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil
	}
	resp, err := p.cfg.Client.Do(req)
	if err != nil {
		p.cfg.Log.Warn("edge manifest fetch failed", "path", path, "err", err)
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil
	}
	var m ssr.Manifest
	if err := json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(&m); err != nil {
		p.cfg.Log.Warn("edge manifest decode failed", "path", path, "err", err)
		return nil
	}
	return &m
}

// normalizePath mirrors connector/src/runtime.ts normalizePath so the manifest
// key matches what the client would request for the same URL.
func normalizePath(p string) string {
	if p == "" {
		return "/"
	}
	if i := strings.IndexAny(p, "?#"); i >= 0 {
		p = p[:i]
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	if len(p) > 1 {
		p = strings.TrimRight(p, "/")
		if p == "" {
			p = "/"
		}
	}
	return p
}

func singleJoin(a, b string) string {
	return strings.TrimRight(a, "/") + "/" + strings.TrimLeft(b, "/")
}

// --- manifest cache ---------------------------------------------------------

type cacheEntry struct {
	manifest  *ssr.Manifest
	fetchedAt time.Time
}

type manifestCache struct {
	mu sync.RWMutex
	m  map[string]cacheEntry
}

func newManifestCache() *manifestCache { return &manifestCache{m: map[string]cacheEntry{}} }

func (c *manifestCache) get(path string, ttl time.Duration) (*ssr.Manifest, bool) {
	c.mu.RLock()
	e, ok := c.m[path]
	c.mu.RUnlock()
	if !ok || time.Since(e.fetchedAt) > ttl {
		return nil, false
	}
	return e.manifest, true
}

func (c *manifestCache) set(path string, m *ssr.Manifest) {
	c.mu.Lock()
	c.m[path] = cacheEntry{manifest: m, fetchedAt: time.Now()}
	c.mu.Unlock()
}
