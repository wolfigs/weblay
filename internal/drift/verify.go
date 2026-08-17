package drift

import (
	"context"
	"io"
	"net/http"
	"strings"
	"time"

	"golang.org/x/net/html"
)

// InstallReport is the result of checking whether the Weblay connector is
// present and correctly configured on a live page.
type InstallReport struct {
	URL          string `json:"url"`
	Reachable    bool   `json:"reachable"`    // the page responded with 200 HTML
	StatusCode   int    `json:"statusCode"`   // raw HTTP status (0 if unreachable)
	ScriptFound  bool   `json:"scriptFound"`  // a weblay.js <script> tag is present
	SiteKeyMatch bool   `json:"siteKeyMatch"` // that tag's data-site matches this site
	Installed    bool   `json:"installed"`    // script found AND key matches
	Message      string `json:"message"`      // human-readable summary
}

// CheckInstall fetches a page and reports whether the Weblay connector script is
// installed with the expected site key. It is the server-side half of the
// dashboard's "Verify installation" button. The caller must ensure the URL's
// origin is one the site owns (SSRF-safe), exactly as the crawler does.
func CheckInstall(ctx context.Context, client *http.Client, pageURL, siteKey string) InstallReport {
	rep := InstallReport{URL: pageURL}
	if client == nil {
		client = &http.Client{Timeout: 12 * time.Second}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pageURL, nil)
	if err != nil {
		rep.Message = "invalid URL"
		return rep
	}
	req.Header.Set("User-Agent", "WeblayInstallVerifier/1.0")
	resp, err := client.Do(req)
	if err != nil {
		rep.Message = "could not reach the page — check the URL is public and correct"
		return rep
	}
	defer resp.Body.Close()
	rep.StatusCode = resp.StatusCode
	if resp.StatusCode != http.StatusOK {
		rep.Message = "the page did not return HTTP 200"
		return rep
	}
	if ct := resp.Header.Get("Content-Type"); ct != "" && !strings.Contains(ct, "html") {
		rep.Message = "the URL did not return an HTML page"
		return rep
	}
	rep.Reachable = true

	doc, err := html.Parse(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		rep.Message = "the page HTML could not be parsed"
		return rep
	}

	// Walk every <script> and look for one that loads weblay.js. Accept the tag
	// whether or not it is our exact origin (a proxy/CDN may rewrite the host),
	// keying the match on the data-site attribute instead.
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if rep.Installed {
			return
		}
		if n.Type == html.ElementNode && strings.EqualFold(n.Data, "script") {
			src := attr(n, "src")
			if strings.Contains(src, "weblay.js") {
				rep.ScriptFound = true
				if attr(n, "data-site") == siteKey {
					rep.SiteKeyMatch = true
					rep.Installed = true
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	switch {
	case rep.Installed:
		rep.Message = "Connector detected — Weblay is installed correctly."
	case rep.ScriptFound && !rep.SiteKeyMatch:
		rep.Message = "A Weblay script is present but its data-site key does not match this site."
	default:
		rep.Message = "No Weblay script found on the page — add the install snippet to <head>."
	}
	return rep
}
