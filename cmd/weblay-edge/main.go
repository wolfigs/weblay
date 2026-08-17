// weblay-edge is a reverse proxy that makes Weblay edits SEO-correct for any
// stack, with no application changes. Route your site's traffic through it: it
// forwards each request to your origin and, for HTML responses, applies the
// page's published Weblay manifest server-side, so crawlers and social-preview
// bots see the edited content in the raw HTML.
//
// Usage:
//
//	weblay-edge \
//	  -listen :8080 \
//	  -origin https://origin.example.com \
//	  -server https://api.weblay.app \
//	  -site-key sk_live_xxx
//
// Flags fall back to environment variables: WEBLAY_EDGE_LISTEN,
// WEBLAY_EDGE_ORIGIN, WEBLAY_EDGE_SERVER, WEBLAY_EDGE_SITE_KEY,
// WEBLAY_EDGE_MANIFEST_TTL.
package main

import (
	"flag"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/wolfigs/weblay/internal/edge"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))

	listen := flag.String("listen", env("WEBLAY_EDGE_LISTEN", ":8080"), "address to listen on")
	origin := flag.String("origin", env("WEBLAY_EDGE_ORIGIN", ""), "upstream origin base URL (required)")
	server := flag.String("server", env("WEBLAY_EDGE_SERVER", ""), "Weblay server base URL (required)")
	siteKey := flag.String("site-key", env("WEBLAY_EDGE_SITE_KEY", ""), "site public key (required)")
	ttl := flag.Duration("manifest-ttl", envDuration("WEBLAY_EDGE_MANIFEST_TTL", 30*time.Second), "manifest cache TTL")
	flag.Parse()

	if *origin == "" || *server == "" || *siteKey == "" {
		log.Error("missing required flags", "need", "-origin, -server, -site-key")
		flag.Usage()
		os.Exit(2)
	}
	originURL, err := url.Parse(*origin)
	if err != nil || originURL.Scheme == "" || originURL.Host == "" {
		log.Error("invalid -origin (need scheme://host)", "value", *origin, "err", err)
		os.Exit(2)
	}

	proxy, err := edge.New(edge.Config{
		Origin:      originURL,
		Server:      *server,
		SiteKey:     *siteKey,
		ManifestTTL: *ttl,
		Log:         log,
	})
	if err != nil {
		log.Error("failed to start edge proxy", "err", err)
		os.Exit(1)
	}

	srv := &http.Server{
		Addr:              *listen,
		Handler:           proxy,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Info("weblay-edge listening",
		"listen", *listen, "origin", originURL.String(), "server", *server, "manifestTTL", ttl.String())
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envDuration(key string, def time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}
