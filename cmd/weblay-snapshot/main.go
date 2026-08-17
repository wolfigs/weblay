// weblay-snapshot renders a static, SEO-correct copy of a site by applying the
// published Weblay manifest to each page server-side. Use it for fully static /
// brochure sites that have no server, CDN worker, or build hook — the one case
// client-side editing can't make crawler-visible on its own.
//
// Usage:
//
//	weblay-snapshot \
//	  -origin https://example.com \
//	  -server https://api.weblay.app \
//	  -site-key sk_live_xxx \
//	  -paths / /about /pricing \
//	  -out ./snapshot
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/wolfigs/weblay/internal/snapshot"
)

func main() {
	origin := flag.String("origin", "", "live site base URL (required)")
	server := flag.String("server", "", "Weblay server base URL (required)")
	siteKey := flag.String("site-key", "", "site public key (required)")
	out := flag.String("out", "./snapshot", "output directory")
	var paths multiFlag
	flag.Var(&paths, "paths", "page paths to export (repeat or comma-separate); default /")
	flag.Parse()

	if *origin == "" || *server == "" || *siteKey == "" {
		fmt.Fprintln(os.Stderr, "error: -origin, -server and -site-key are required")
		flag.Usage()
		os.Exit(2)
	}
	if len(paths) == 0 {
		paths = multiFlag{"/"}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	results, err := snapshot.Export(ctx, snapshot.Config{Origin: *origin, Server: *server, SiteKey: *siteKey}, paths, *out)
	if err != nil {
		fmt.Fprintln(os.Stderr, "export failed:", err)
		os.Exit(1)
	}
	var edited, skipped int
	for _, r := range results {
		switch {
		case r.Skipped != "":
			skipped++
			fmt.Printf("  skip  %-20s %s\n", r.Path, r.Skipped)
		case r.Edited:
			edited++
			fmt.Printf("  edit  %-20s -> %s\n", r.Path, r.File)
		default:
			fmt.Printf("  copy  %-20s -> %s\n", r.Path, r.File)
		}
	}
	fmt.Printf("\n%d pages (%d with edits, %d skipped) written to %s\n", len(results), edited, skipped, *out)
}

type multiFlag []string

func (m *multiFlag) String() string { return strings.Join(*m, ",") }
func (m *multiFlag) Set(v string) error {
	for _, part := range strings.Split(v, ",") {
		if p := strings.TrimSpace(part); p != "" {
			*m = append(*m, p)
		}
	}
	return nil
}
