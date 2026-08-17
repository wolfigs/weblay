// Package snapshot renders a static, SEO-correct copy of a site: it fetches each
// page from the origin, applies the page's published Weblay manifest server-side
// (via internal/ssr), and writes the rewritten HTML to disk. This is the
// "snapshot export" delivery mode — the option for fully static / brochure sites
// with no server, CDN worker, or build hook.
package snapshot

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wolfigs/weblay/internal/ssr"
)

// Config controls an export run.
type Config struct {
	Origin  string // base URL of the live site, e.g. https://example.com
	Server  string // Weblay server base URL
	SiteKey string // site public key
	Client  *http.Client
}

// Result reports the outcome for one exported path.
type Result struct {
	Path    string
	File    string
	Edited  bool // whether a manifest was applied
	Skipped string
}

// Export renders each path and writes it under outDir. It returns a per-path
// result slice; a single page failing to fetch does not abort the run.
func Export(ctx context.Context, cfg Config, paths []string, outDir string) ([]Result, error) {
	if cfg.Client == nil {
		cfg.Client = &http.Client{Timeout: 15 * time.Second}
	}
	cfg.Origin = strings.TrimRight(cfg.Origin, "/")
	cfg.Server = strings.TrimRight(cfg.Server, "/")

	var results []Result
	for _, p := range paths {
		path := normalizePath(p)
		res := Result{Path: path}

		html, err := cfg.fetch(ctx, cfg.Origin+path)
		if err != nil {
			res.Skipped = "fetch origin: " + err.Error()
			results = append(results, res)
			continue
		}
		manifest := cfg.manifest(ctx, path)
		out, err := ssr.Rewrite(html, manifest)
		if err != nil {
			out = html // never fail the page; ship the origin HTML
		}
		res.Edited = manifest != nil && len(manifest.Elements) > 0

		file := outputFile(outDir, path)
		if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
			return results, err
		}
		if err := os.WriteFile(file, out, 0o644); err != nil {
			return results, err
		}
		res.File = file
		results = append(results, res)
	}
	return results, nil
}

func (c Config) fetch(ctx context.Context, u string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept-Encoding", "identity")
	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 32<<20))
}

func (c Config) manifest(ctx context.Context, path string) *ssr.Manifest {
	u := fmt.Sprintf("%s/m/%s/manifest.json?path=%s", c.Server, url.PathEscape(c.SiteKey), url.QueryEscape(path))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil
	}
	resp, err := c.Client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return nil
	}
	defer resp.Body.Close()
	var m ssr.Manifest
	if err := json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(&m); err != nil {
		return nil
	}
	return &m
}

// outputFile maps a URL path to a static file: "/" -> index.html, "/about" ->
// about/index.html (so relative links keep working when served statically).
func outputFile(outDir, path string) string {
	if path == "/" {
		return filepath.Join(outDir, "index.html")
	}
	return filepath.Join(outDir, filepath.FromSlash(strings.TrimPrefix(path, "/")), "index.html")
}

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
