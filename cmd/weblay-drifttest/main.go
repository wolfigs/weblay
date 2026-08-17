// Command weblay-drifttest is a throwaway end-to-end harness that exercises the
// full drift pipeline against the running demo: it seeds real overrides (with
// faithful descriptors) through the edit API, mutates the live static site to
// introduce every drift category, runs the real crawler, and verifies both the
// classification and that each recommended cure clears the warning.
//
//	go run ./cmd/weblay-drifttest seed    # create overrides + introduce drift + crawl
//	go run ./cmd/weblay-drifttest report  # print detected category per override
//	go run ./cmd/weblay-drifttest cure    # apply recommended cures + re-crawl
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"os"
	"strings"

	"golang.org/x/net/html"

	"github.com/wolfigs/weblay/internal/drift"
)

const (
	base     = "http://localhost:8787"
	liveURL  = "http://localhost:5555/"
	origin   = "http://localhost:5555"
	siteKey  = "ilk_abc543778b5b96d9da9a"
	email    = "demo@wolfigs.dev"
	password = "demo-pass-1234"
	pagePath = "/"
)

var htmlFile = os.Getenv("SITE_HTML")

type scenario struct {
	name     string // label
	weblay   string // data-weblay name (empty for the structural/moved case)
	selector string // override key (filled from descriptor path)
	find     func(*html.Node) *html.Node
	editText string
	expect   string // expected category after drift
	mutate   [2]string // old,new string replacement on the html file (empty = none)
	cure     string    // reset | rebind | harden | none
	// for rebind/harden we relocate the element in the mutated DOM:
	relocate func(*html.Node) *html.Node
	// unmutate reverts the source change (used by harden):
	unmutate [2]string
}

var client *http.Client
var token string

func main() {
	if htmlFile == "" {
		fmt.Fprintln(os.Stderr, "set SITE_HTML to the served index.html path")
		os.Exit(1)
	}
	jar, _ := cookiejar.New(nil)
	client = &http.Client{Jar: jar}
	login()
	token = editToken()

	cmd := "seed"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	switch cmd {
	case "seed":
		seed()
	case "report":
		report()
	case "cure":
		cure()
	default:
		fmt.Println("unknown command", cmd)
	}
}

func scenarios() []scenario {
	byWeblay := func(name string) func(*html.Node) *html.Node {
		return func(root *html.Node) *html.Node { return findAttr(root, "data-weblay", name) }
	}
	// One override per drift category, plus healthy "padding" overrides so the
	// drifted set stays a minority (< the 40% mass-drift threshold) — otherwise
	// the whole page correctly trips full-revamp and masks per-category results.
	scen := []scenario{
		{
			name: "content-conflict", weblay: "hero-title", editText: "Fresh-roasted, always",
			expect: drift.CatConflict, cure: "reset",
			mutate: [2]string{
				`<h1 data-weblay="hero-title">Coffee is produce, not pantry stock.</h1>`,
				`<h1 data-weblay="hero-title">Coffee is our craft, not a commodity.</h1>`,
			},
		},
		{
			name: "removed", weblay: "footer-blurb", editText: "Small-batch, roasted to order",
			expect: drift.CatRemoved, cure: "reset",
			mutate: [2]string{
				`<p class="blurb" data-weblay="footer-blurb">Small-batch beans, roasted the morning you order. Brewed with care in the heart of Lakeview since 2019.</p>`,
				"",
			},
		},
		{
			name: "replaced", weblay: "craft-title", editText: "Roasted to order, always",
			expect: drift.CatReplaced, cure: "rebind",
			mutate: [2]string{
				`<h2 data-weblay="craft-title">Roasted the morning you order</h2>`,
				`<div data-weblay="craft-title">Roasted the morning you order</div>`,
			},
			relocate: byWeblay("craft-title"),
		},
		{
			name: "moved", find: findSeeTheMenu, editText: "Browse the menu",
			expect: drift.CatMoved, cure: "rebind",
			mutate: [2]string{
				"    <a class=\"btn btn-primary\" href=\"/menu/\">See the menu</a>\n    <a class=\"btn btn-ghost\" href=\"/about/\">Our story</a>",
				"    <a class=\"btn btn-ghost\" href=\"/about/\">Our story</a>\n    <a class=\"btn btn-primary\" href=\"/menu/\">See the menu</a>",
			},
			relocate: findSeeTheMenu,
		},
		{
			name: "ambiguous", weblay: "roast-1-name", editText: "Ethiopia Guji (single origin)",
			expect: drift.CatAmbiguous, cure: "harden",
			mutate: [2]string{
				`<h3 data-weblay="roast-1-name">Ethiopia Guji</h3>`,
				`<h3 data-weblay="roast-1-name">Ethiopia Guji</h3><h3 data-weblay="roast-1-name">Ethiopia Guji</h3>`,
			},
			// harden = developer removes the duplicate anchor
			unmutate: [2]string{
				`<h3 data-weblay="roast-1-name">Ethiopia Guji</h3><h3 data-weblay="roast-1-name">Ethiopia Guji</h3>`,
				`<h3 data-weblay="roast-1-name">Ethiopia Guji</h3>`,
			},
		},
	}
	// Healthy padding: overrides on stable, un-mutated elements. These keep the
	// drift ratio low AND double as controls that must stay CatOK/healthy.
	for _, name := range []string{
		"hero-subtitle", "featured-title", "featured-sub", "roast-2-name", "roast-3-name",
		"roast-1-desc", "roast-2-desc", "roast-3-desc", "cta-title", "cta-sub",
	} {
		scen = append(scen, scenario{
			name: "healthy:" + name, weblay: name, editText: "edited",
			expect: drift.CatOK, cure: "none",
		})
	}
	// Fill in the finder for every data-weblay scenario.
	for i := range scen {
		if scen[i].find == nil && scen[i].weblay != "" {
			scen[i].find = byWeblay(scen[i].weblay)
		}
	}
	return scen
}

func seed() {
	// 1) Build descriptors from the pristine live page and create overrides.
	doc := fetchDoc(liveURL)
	scen := scenarios()
	fmt.Println("── seeding overrides (real edit API + faithful descriptors) ──")
	for i := range scen {
		s := &scen[i]
		node := s.find(doc)
		if node == nil {
			fmt.Printf("  ✗ %-16s could not locate element\n", s.name)
			continue
		}
		desc := drift.BuildDescriptorJSON(node)
		var d struct {
			Path string `json:"path"`
		}
		_ = json.Unmarshal([]byte(desc), &d)
		s.selector = d.Path
		putContent(s.selector, s.editText, desc)
		fmt.Printf("  ✓ %-16s override on %s\n", s.name, s.selector)
	}
	publish()

	// 2) Introduce the drift by mutating the served HTML.
	src, _ := os.ReadFile(htmlFile)
	body := string(src)
	fmt.Println("── introducing drift into the live site ──")
	for _, s := range scen {
		if s.mutate[0] == "" {
			continue
		}
		if !strings.Contains(body, s.mutate[0]) {
			fmt.Printf("  ✗ %-16s mutation target not found\n", s.name)
			continue
		}
		body = strings.Replace(body, s.mutate[0], s.mutate[1], 1)
		fmt.Printf("  ✓ %-16s mutated source\n", s.name)
	}
	_ = os.WriteFile(htmlFile, []byte(body), 0o644)

	// 3) Run the real crawler.
	fmt.Println("── running drift crawl ──")
	scan()
	report()
}

func report() {
	bindings := healthBindings()
	scen := scenarios()
	// Map selector→binding.
	fmt.Println("── detection report ──")
	pass, fail := 0, 0
	for _, s := range scen {
		// rebuild selector from a fresh (possibly mutated) fetch for lookup
		var b *binding
		for i := range bindings {
			if matchesScenario(&bindings[i], s) {
				b = &bindings[i]
				break
			}
		}
		if b == nil {
			fmt.Printf("  ? %-16s no binding found\n", s.name)
			continue
		}
		ok := b.Category == s.expect
		mark := "✓"
		if !ok {
			mark = "✗"
			fail++
		} else {
			pass++
		}
		fmt.Printf("  %s %-16s expected=%-16s got=%-16s status=%-11s conf=%d%%  %v\n",
			mark, s.name, s.expect, b.Category, b.Status, b.Confidence, b.Reasons)
	}
	fmt.Printf("── detection: %d passed, %d failed ──\n", pass, fail)
}

func cure() {
	fmt.Println("── applying recommended cures ──")
	scen := scenarios()
	// For rebind we need the mutated DOM to relocate elements.
	doc := fetchDoc(liveURL)
	bindings := healthBindings()

	for _, s := range scen {
		var b *binding
		for i := range bindings {
			if matchesScenario(&bindings[i], s) {
				b = &bindings[i]
				break
			}
		}
		switch s.cure {
		case "reset":
			if b != nil {
				resetElement(b.Selector)
			}
			fmt.Printf("  ✓ %-16s reset (override removed)\n", s.name)
		case "rebind":
			node := s.relocate(doc)
			if node == nil {
				fmt.Printf("  ✗ %-16s rebind: element not found\n", s.name)
				continue
			}
			desc := drift.BuildDescriptorJSON(node)
			var d struct {
				Path string `json:"path"`
			}
			_ = json.Unmarshal([]byte(desc), &d)
			// If the anchor moved to a new selector key, drop the stale binding.
			if b != nil && b.Selector != d.Path {
				resetElement(b.Selector)
			}
			putContent(d.Path, s.editText, desc)
			fmt.Printf("  ✓ %-16s rebound to %s\n", s.name, d.Path)
		case "harden":
			// Developer removes the ambiguity in source; descriptor stays valid.
			if s.unmutate[0] != "" {
				src, _ := os.ReadFile(htmlFile)
				body := strings.Replace(string(src), s.unmutate[0], s.unmutate[1], 1)
				_ = os.WriteFile(htmlFile, []byte(body), 0o644)
			}
			fmt.Printf("  ✓ %-16s hardened (duplicate anchor removed)\n", s.name)
		}
	}
	publish()
	fmt.Println("── re-crawling after cures ──")
	scan()

	// Verify each cured binding is now HEALTHY (rebind/harden) or GONE (reset).
	bindings = healthBindings()
	fmt.Println("── cure verification ──")
	pass, fail := 0, 0
	for _, s := range scen {
		if s.cure == "none" {
			continue
		}
		var b *binding
		for i := range bindings {
			if matchesScenario(&bindings[i], s) {
				b = &bindings[i]
				break
			}
		}
		ok := false
		detail := ""
		switch s.cure {
		case "reset":
			ok = b == nil // override removed entirely
			detail = "override removed"
			if b != nil {
				detail = "STILL PRESENT: " + b.Status
			}
		case "rebind", "harden":
			ok = b != nil && b.Status == "healthy"
			if b != nil {
				detail = fmt.Sprintf("%s / %s conf=%d%%", b.Status, b.Category, b.Confidence)
			} else {
				detail = "binding missing"
			}
		}
		mark := "✓"
		if ok {
			pass++
		} else {
			mark = "✗"
			fail++
		}
		fmt.Printf("  %s %-16s cure=%-7s → %s\n", mark, s.name, s.cure, detail)
	}
	fmt.Printf("── cures: %d cleared, %d failed ──\n", pass, fail)

	// Final: confirm the site now reports zero issues.
	fmt.Printf("── site issue count after cures: %d ──\n", siteIssueCount())
}

// matchesScenario finds the binding belonging to a scenario. data-weblay
// scenarios are keyed by [data-weblay="name"]; the untagged "moved" case is the
// sole structural-path binding.
func matchesScenario(b *binding, s scenario) bool {
	if s.weblay != "" {
		return strings.Contains(b.Selector, `"`+s.weblay+`"`)
	}
	return !strings.HasPrefix(b.Selector, "[data-weblay")
}

// ---- HTTP helpers ----

func login() {
	do("POST", base+"/api/v1/auth/login", nil, map[string]string{"email": email, "password": password}, nil)
}

func editToken() string {
	var out struct {
		Token string `json:"token"`
	}
	do("POST", base+"/api/v1/sites/"+siteID()+"/edit-token", nil, map[string]any{}, &out)
	return out.Token
}

var cachedSiteID string

func siteID() string {
	if cachedSiteID != "" {
		return cachedSiteID
	}
	var sites []struct {
		ID      string `json:"id"`
		SiteKey string `json:"siteKey"`
	}
	do("GET", base+"/api/v1/sites", nil, nil, &sites)
	for _, s := range sites {
		if s.SiteKey == siteKey {
			cachedSiteID = s.ID
		}
	}
	return cachedSiteID
}

func putContent(selector, text, descriptor string) {
	body := map[string]any{
		"path":       pagePath,
		"selector":   selector,
		"content":    map[string]any{"text": text},
		"descriptor": json.RawMessage(descriptor),
		"risk":       map[string]any{"confidence": 100, "reasons": []string{}},
	}
	do("PUT", base+"/api/v1/edit/content", bearer(), body, nil)
}

func publish() {
	do("POST", base+"/api/v1/edit/publish", bearer(), map[string]string{"path": pagePath}, nil)
}

func resetElement(selector string) {
	do("POST", base+"/api/v1/edit/reset-element", bearer(), map[string]string{"path": pagePath, "selector": selector}, nil)
}

func scan() {
	do("POST", base+"/api/v1/sites/"+siteID()+"/health/scan", nil, map[string]any{}, nil)
}

type binding struct {
	Selector   string   `json:"selector"`
	Status     string   `json:"status"`
	Category   string   `json:"category"`
	Confidence int      `json:"confidence"`
	Reasons    []string `json:"reasons"`
}

func healthBindings() []binding {
	var out struct {
		Bindings []binding `json:"bindings"`
	}
	do("GET", base+"/api/v1/sites/"+siteID()+"/health", nil, nil, &out)
	return out.Bindings
}

func siteIssueCount() int {
	var sites []struct {
		SiteKey string `json:"siteKey"`
		Issues  int    `json:"issues"`
	}
	do("GET", base+"/api/v1/sites", nil, nil, &sites)
	for _, s := range sites {
		if s.SiteKey == siteKey {
			return s.Issues
		}
	}
	return -1
}

func bearer() map[string]string { return map[string]string{"Authorization": "Bearer " + token} }

func do(method, url string, headers map[string]string, body any, out any) {
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, url, r)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Fprintln(os.Stderr, method, url, "error:", err)
		return
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		fmt.Fprintf(os.Stderr, "%s %s -> %d %s\n", method, url, resp.StatusCode, string(data))
		return
	}
	if out != nil {
		_ = json.Unmarshal(data, out)
	}
}

func fetchDoc(url string) *html.Node {
	resp, err := client.Get(url)
	if err != nil {
		fmt.Fprintln(os.Stderr, "fetch", url, err)
		os.Exit(1)
	}
	defer resp.Body.Close()
	doc, _ := html.Parse(resp.Body)
	return doc
}

// ---- DOM locators ----

func findAttr(root *html.Node, key, val string) *html.Node {
	var found *html.Node
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if found != nil {
			return
		}
		if n.Type == html.ElementNode {
			for _, a := range n.Attr {
				if a.Key == key && a.Val == val {
					found = n
					return
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(root)
	return found
}

func findSeeTheMenu(root *html.Node) *html.Node {
	var found *html.Node
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if found != nil {
			return
		}
		if n.Type == html.ElementNode && strings.EqualFold(n.Data, "a") {
			if strings.Contains(nodeText(n), "See the menu") {
				found = n
				return
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(root)
	return found
}

func nodeText(n *html.Node) string {
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(x *html.Node) {
		if x.Type == html.TextNode {
			b.WriteString(x.Data)
		}
		for c := x.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return strings.TrimSpace(b.String())
}
