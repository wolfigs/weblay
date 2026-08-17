package drift

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"golang.org/x/net/html"

	"github.com/wolfigs/weblay/internal/store"
)

// massDriftRatio: if more than this fraction of a page's bindings fail to
// resolve, treat it as a redesign (pause + flag) rather than incremental drift.
const massDriftRatio = 0.4

// Crawler re-anchors every binding of a site against freshly-fetched HTML.
type Crawler struct {
	St     store.Store
	Client *http.Client
	Log    *slog.Logger
}

// New builds a Crawler with a bounded HTTP client.
func New(st store.Store, log *slog.Logger) *Crawler {
	return &Crawler{
		St:     st,
		Client: &http.Client{Timeout: 12 * time.Second},
		Log:    log,
	}
}

// Result summarizes a site crawl.
type Result struct {
	Checked int
	Broken  int
	Pages   int
}

// CrawlSite fetches each edited page from an allowed origin, re-resolves every
// binding, and updates its status. Fetches only the site's registered origins
// (SSRF-safe: the developer controls those).
func (c *Crawler) CrawlSite(ctx context.Context, site *store.Site) (Result, error) {
	var res Result
	bindings, err := c.St.BindingHealthForSite(ctx, site.ID)
	if err != nil {
		return res, err
	}
	if len(bindings) == 0 || len(site.Origins) == 0 {
		return res, nil
	}
	origin := strings.TrimRight(site.Origins[0], "/")

	// Group bindings by page path.
	byPath := map[string][]*store.BindingHealth{}
	for _, b := range bindings {
		byPath[b.Path] = append(byPath[b.Path], b)
	}

	for path, group := range byPath {
		res.Pages++
		// All status writes for this page are collected here and flushed in a
		// single bulk update, so a page of N bindings costs one database
		// round-trip rather than N.
		var updates []store.BindingStatusUpdate

		// A binding with no identity descriptor (legacy/seeded/telemetry-only) can't
		// be checked against live HTML. Clear any stale crawl alarm on it up front —
		// unconditionally, even if the fetch below fails — so unverifiable rows never
		// linger as false alarms and never feed the redesign ratio.
		var verifiableBindings []*store.BindingHealth
		for _, b := range group {
			if strings.TrimSpace(b.Descriptor) == "" {
				updates = append(updates, store.BindingStatusUpdate{ID: b.ID, Confidence: 100, Status: statusHealthy, Category: CatUnknown, Reasons: []string{"unverified"}})
				continue
			}
			verifiableBindings = append(verifiableBindings, b)
		}
		if len(verifiableBindings) == 0 {
			_ = c.St.UpdateBindingStatusBulk(ctx, updates)
			continue
		}
		doc, err := c.fetch(ctx, origin+path)
		if err != nil {
			c.Log.Warn("drift crawl fetch failed", "site", site.ID, "path", path, "err", err)
			_ = c.St.UpdateBindingStatusBulk(ctx, updates)
			continue
		}
		verifiable := len(verifiableBindings)
		results, resolved, pageBroken := resolveGroup(doc, verifiableBindings)

		// Rendering escalation: if few bindings resolved against the static HTML,
		// the page's content may be injected by client-side JavaScript and thus
		// absent from the initial response. Re-fetch through the headless
		// rendering channel and keep the better outcome. The static fetch remains
		// the default, so this cost is paid only for likely client-rendered pages.
		if resolved*2 < verifiable {
			if rdoc, rerr := c.renderFetch(ctx, origin+path); rerr == nil {
				r2, resolved2, broken2 := resolveGroup(rdoc, verifiableBindings)
				if resolved2 > resolved {
					results, resolved, pageBroken = r2, resolved2, broken2
					c.Log.Info("drift crawl used rendering channel",
						"site", site.ID, "path", path, "resolved", resolved2, "of", verifiable)
				}
			} else {
				c.Log.Warn("render fetch failed", "site", site.ID, "path", path, "err", rerr)
			}
		}
		res.Checked += verifiable

		base := len(updates)
		updates = append(updates, results...)
		// Mass-drift → likely a redesign: flag the whole page and pause. (The
		// fetch already validated a real 200 HTML page, so this isn't a transient
		// error page — one corroboration axis; human confirmation is the other.)
		// Only verifiable bindings count, so unverifiable ones can't fake a revamp.
		if verifiable >= 3 && float64(pageBroken)/float64(verifiable) > massDriftRatio {
			for i, b := range verifiableBindings {
				updates[base+i] = store.BindingStatusUpdate{ID: b.ID, Confidence: 20, Status: statusQuarantined, Category: CatReplaced, Reasons: []string{"redesign-suspected"}}
			}
			c.Log.Warn("mass drift detected", "site", site.ID, "path", path, "broken", pageBroken, "total", verifiable)
		}
		_ = c.St.UpdateBindingStatusBulk(ctx, updates)
		res.Broken += pageBroken
	}
	return res, nil
}

// resolveGroup re-resolves each binding against one parsed document, returning
// the status updates, the number that resolved to a live element (healthy or
// at-risk), and the number that are broken or quarantined. The resolved count
// drives the decision to escalate to the rendering channel.
func resolveGroup(doc *html.Node, bindings []*store.BindingHealth) (updates []store.BindingStatusUpdate, resolved, broken int) {
	for _, b := range bindings {
		r := Resolve(doc, b.Descriptor)
		if r.Status == statusBroken || r.Status == statusQuarantined {
			broken++
		} else {
			resolved++
		}
		updates = append(updates, store.BindingStatusUpdate{ID: b.ID, Confidence: r.Confidence, Status: r.Status, Category: r.Category, Reasons: r.Reasons})
	}
	return updates, resolved, broken
}

func (c *Crawler) fetch(ctx context.Context, url string) (*html.Node, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "WeblayDriftCrawler/1.0")
	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	// Corroboration: only trust a real 200 HTML page. An error page, redirect to
	// a login wall, or a challenge would otherwise look like a mass "revamp" and
	// wrongly quarantine every override.
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("origin returned %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "" && !strings.Contains(ct, "html") {
		return nil, fmt.Errorf("origin returned non-html %q", ct)
	}
	return html.Parse(io.LimitReader(resp.Body, 8<<20)) // cap at 8 MiB
}
