// Command weblay-eval runs the paper's extended evaluation: detection accuracy
// across site archetypes, per-signal resilience under structural perturbation,
// robustness to build churn, and crawl latency versus binding count. All numbers
// are measured against the running server and live pages; nothing is synthetic
// beyond the controlled markup perturbations.
//
//	EVAL_DIR=/path/to/eval go run ./cmd/weblay-eval
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"os"
	"os/exec"
	"sort"
	"strings"
	"time"

	"golang.org/x/net/html"

	"github.com/wolfigs/weblay/internal/drift"
)

const (
	base     = "http://localhost:8787"
	origin   = "http://localhost:5560"
	email    = "demo@wolfigs.dev"
	password = "demo-pass-1234"
)

var (
	client  *http.Client
	siteID  string
	token   string
	evalDir = os.Getenv("EVAL_DIR")
)

func main() {
	if evalDir == "" {
		fmt.Fprintln(os.Stderr, "set EVAL_DIR to the served eval directory")
		os.Exit(1)
	}
	jar, _ := cookiejar.New(nil)
	client = &http.Client{Jar: jar}
	login()
	setupSite()

	fmt.Println("\n########## EXPERIMENT 1: DETECTION ACROSS SITE ARCHETYPES ##########")
	exp1()
	fmt.Println("\n########## EXPERIMENT 2: PER-SIGNAL RESILIENCE ##########")
	exp2()
	fmt.Println("\n########## EXPERIMENT 3: BUILD-CHURN ROBUSTNESS ##########")
	exp3()
	fmt.Println("\n########## EXPERIMENT 4: CRAWL LATENCY vs BINDING COUNT ##########")
	exp4()
}

// ---- Experiment 1: detection accuracy across archetypes ----

type drifted struct {
	weblay string // data-weblay name, or "" for structural (framework)
	find   func(*html.Node) *html.Node
	mutate [2]string // old,new HTML replacement
	expect string    // expected category
}

func exp1() {
	fmt.Printf("%-12s %-8s %-8s %-8s %-10s\n", "archetype", "seeded", "correct", "acc", "false-pos")
	archetypes := []struct {
		path    string
		drifts  []drifted
		healthy []string // data-weblay names kept unchanged (controls)
	}{
		{
			path: "/semantic/",
			drifts: []drifted{
				{weblay: "hero-title", mutate: [2]string{`<h1 data-weblay="hero-title">Fresh coffee delivered</h1>`, `<div data-weblay="hero-title">Fresh coffee delivered</div>`}, expect: drift.CatReplaced},
				{weblay: "about-body", mutate: [2]string{`<p data-weblay="about-body">We roast small batches every morning.</p>`, `<p data-weblay="about-body">We roast small batches to order.</p>`}, expect: drift.CatConflict},
				{weblay: "contact-body", mutate: [2]string{`  <p data-weblay="contact-body">14 Lakeview Terrace, open daily.</p>` + "\n", ""}, expect: drift.CatRemoved},
			},
			healthy: []string{"hero-sub", "hero-cta", "about-title", "contact-title"},
		},
		{
			// framework: NO data-weblay -> descriptor uses structural path + fingerprint
			path: "/framework/",
			drifts: []drifted{
				{find: byText("h1", "Fresh coffee delivered"), mutate: [2]string{`<h1 class="Hero_title__p0q1r">Fresh coffee delivered</h1>`, `<div class="Hero_title__p0q1r">Fresh coffee delivered</div>`}, expect: drift.CatReplaced},
				{find: byText("p", "We roast small batches every morning."), mutate: [2]string{`We roast small batches every morning.`, `We roast small batches to order.`}, expect: drift.CatConflict},
			},
			healthy: nil,
		},
		{
			path: "/repeater/",
			drifts: []drifted{
				{weblay: "roast-2-name", mutate: [2]string{`<h3 data-weblay="roast-2-name">Sumatra Lintong</h3>`, `<h3 data-weblay="roast-2-name">Sumatra Lintong</h3><h3 data-weblay="roast-2-name">Sumatra Lintong</h3>`}, expect: drift.CatAmbiguous},
				{weblay: "roast-4-desc", mutate: [2]string{`<p data-weblay="roast-4-desc">Notes for Brazil Cerrado.</p>`, `<p data-weblay="roast-4-desc">Bright citrus notes.</p>`}, expect: drift.CatConflict},
			},
			healthy: []string{"page-title", "roast-0-name", "roast-1-name", "roast-3-name", "roast-5-name", "roast-0-price"},
		},
	}

	for _, a := range archetypes {
		resetSite()
		restoreArchetype(a.path)
		doc := fetchDoc(origin + a.path)
		// seed drifted + healthy
		seedFn := func(w string, find func(*html.Node) *html.Node) string {
			var n *html.Node
			if find != nil {
				n = find(doc)
			} else {
				n = findAttr(doc, "data-weblay", w)
			}
			if n == nil {
				return ""
			}
			desc := drift.BuildDescriptorJSON(n)
			var d struct{ Path string }
			_ = json.Unmarshal([]byte(desc), &d)
			putContent(a.path, d.Path, "EDIT", desc)
			return d.Path
		}
		type track struct {
			sel    string
			expect string
		}
		var tracks []track
		for _, dr := range a.drifts {
			sel := seedFn(dr.weblay, dr.find)
			tracks = append(tracks, track{sel, dr.expect})
		}
		for _, w := range a.healthy {
			sel := seedFn(w, nil)
			tracks = append(tracks, track{sel, drift.CatOK})
		}
		publish(a.path)
		// mutate served HTML
		for _, dr := range a.drifts {
			mutateFile(a.path, dr.mutate[0], dr.mutate[1])
		}
		scan()
		binds := bindings()
		correct, falsePos, seeded := 0, 0, len(tracks)
		for _, t := range tracks {
			b := findBinding(binds, t.sel)
			if b == nil {
				continue
			}
			if b.Category == t.expect {
				correct++
			}
			if t.expect == drift.CatOK && b.Category != drift.CatOK {
				falsePos++
			}
		}
		restoreArchetype(a.path)
		acc := 100.0 * float64(correct) / float64(seeded)
		fmt.Printf("%-12s %-8d %-8d %-7.0f%% %d\n", strings.Trim(a.path, "/"), seeded, correct, acc, falsePos)
	}
}

// ---- Experiment 2: per-signal resilience ----
// Seed one edit on the semantic page (has data-weblay + id-path + structural
// path + fingerprint). Progressively break signals and record whether the edit
// still resolves and via which signal (from crawl reasons).

func exp2() {
	fmt.Printf("%-40s %-10s %-24s\n", "perturbation", "resolved", "via (reasons)")
	type step struct {
		name   string
		mutate [][2]string
	}
	steps := []step{
		{"none (control)", nil},
		{"structural path broken (wrap in <div>)", [][2]string{{`<section id="about"><div class="container">`, `<section id="about"><div class="wrap"><div class="container">`}, {`</div></section>`, `</div></div></section>`}}},
		{"path broken + data-weblay removed", [][2]string{{`<section id="about"><div class="container">`, `<section id="about"><div class="wrap"><div class="container">`}, {`</div></section>`, `</div></div></section>`}, {`data-weblay="about-title"`, `class="x"`}}},
		{"sibling reordered before target", [][2]string{{`<h2 data-weblay="about-title">Our roastery</h2>` + "\n  " + `<p data-weblay="about-body">We roast small batches every morning.</p>`, `<p data-weblay="about-body">We roast small batches every morning.</p>` + "\n  " + `<h2 data-weblay="about-title">Our roastery</h2>`}}},
	}
	for _, s := range steps {
		resetSite()
		restoreArchetype("/semantic/")
		doc := fetchDoc(origin + "/semantic/")
		n := findAttr(doc, "data-weblay", "about-title")
		desc := drift.BuildDescriptorJSON(n)
		var d struct{ Path string }
		_ = json.Unmarshal([]byte(desc), &d)
		putContent("/semantic/", d.Path, "EDIT", desc)
		publish("/semantic/")
		for _, m := range s.mutate {
			mutateFile("/semantic/", m[0], m[1])
		}
		scan()
		b := findBinding(bindings(), d.Path)
		resolved, via := "n/a", ""
		if b != nil {
			// resolved if it still applies safely: healthy or a benign move/conflict
			// (not removed, not quarantined onto a wrong element)
			ok := b.Status == "healthy" || b.Category == drift.CatMoved || b.Category == drift.CatConflict
			if ok {
				resolved = "yes"
			} else {
				resolved = "no"
			}
			via = fmt.Sprintf("%s/%s %v", b.Category, b.Status, b.Reasons)
		}
		restoreArchetype("/semantic/")
		fmt.Printf("%-40s %-10s %-24s\n", s.name, resolved, via)
	}
}

// ---- Experiment 3: build-churn robustness ----
// Seed edits, then regenerate the churn page (fresh hashed classes + generated
// ids, identical semantic content). Expect ZERO false drift.

func exp3() {
	resetSite()
	regenChurn()
	doc := fetchDoc(origin + "/churn/")
	names := []string{"hero-title", "hero-sub", "about-title", "about-body"}
	var sels []string
	for _, w := range names {
		n := findAttr(doc, "data-weblay", w)
		if n == nil {
			continue
		}
		desc := drift.BuildDescriptorJSON(n)
		var d struct{ Path string }
		_ = json.Unmarshal([]byte(desc), &d)
		putContent("/churn/", d.Path, "EDIT", desc)
		sels = append(sels, d.Path)
	}
	publish("/churn/")
	rounds := 5
	falseAlarms := 0
	for i := 0; i < rounds; i++ {
		regenChurn() // fresh hashes + generated ids, same content
		scan()
		for _, sel := range sels {
			b := findBinding(bindings(), sel)
			if b != nil && b.Status != "healthy" {
				falseAlarms++
			}
		}
	}
	fmt.Printf("edits=%d  rebuilds=%d  checks=%d  false-alarms=%d  false-alarm-rate=%.1f%%\n",
		len(sels), rounds, len(sels)*rounds, falseAlarms, 100*float64(falseAlarms)/float64(len(sels)*rounds))
}

// ---- Experiment 4: crawl latency vs binding count ----

func exp4() {
	fmt.Printf("%-10s %-10s %-12s\n", "bindings", "runs", "median-ms")
	for _, k := range []int{5, 10, 20, 40} {
		resetSite()
		writeGrid(k)
		doc := fetchDoc(origin + "/grid/")
		for i := 0; i < k; i++ {
			n := findAttr(doc, "data-weblay", fmt.Sprintf("item-%d", i))
			if n == nil {
				continue
			}
			desc := drift.BuildDescriptorJSON(n)
			var d struct{ Path string }
			_ = json.Unmarshal([]byte(desc), &d)
			putContent("/grid/", d.Path, "EDIT", desc)
		}
		publish("/grid/")
		var ms []float64
		for r := 0; r < 5; r++ {
			t0 := time.Now()
			scan()
			ms = append(ms, float64(time.Since(t0).Microseconds())/1000.0)
		}
		sort.Float64s(ms)
		fmt.Printf("%-10d %-10d %-12.1f\n", k, len(ms), ms[len(ms)/2])
	}
}

// ---- helpers ----

func writeGrid(k int) {
	var b strings.Builder
	b.WriteString(`<!doctype html><html><head><meta charset="utf-8"><title>Grid</title></head><body><main><div class="grid">`)
	for i := 0; i < k; i++ {
		fmt.Fprintf(&b, `<div class="card"><h3 data-weblay="item-%d">Item %d</h3></div>`, i, i)
	}
	b.WriteString(`</div></main></body></html>`)
	dir := evalDir + "/grid"
	_ = os.MkdirAll(dir, 0o755)
	_ = os.WriteFile(dir+"/index.html", []byte(b.String()), 0o644)
}

func regenChurn() {
	cmd := exec.Command("python3", evalDir+"/churn/gen.py", evalDir+"/churn/index.html")
	_ = cmd.Run()
}

func restoreArchetype(path string) {
	// re-write from the pristine committed copies kept in *.orig
	name := strings.Trim(path, "/")
	orig := evalDir + "/" + name + "/index.html.orig"
	live := evalDir + "/" + name + "/index.html"
	if data, err := os.ReadFile(orig); err == nil {
		_ = os.WriteFile(live, data, 0o644)
	} else if data, err := os.ReadFile(live); err == nil {
		// first run: snapshot pristine
		_ = os.WriteFile(orig, data, 0o644)
	}
}

func mutateFile(path, oldS, newS string) {
	name := strings.Trim(path, "/")
	live := evalDir + "/" + name + "/index.html"
	data, err := os.ReadFile(live)
	if err != nil {
		return
	}
	s := strings.Replace(string(data), oldS, newS, 1)
	_ = os.WriteFile(live, []byte(s), 0o644)
}

func byText(tag, text string) func(*html.Node) *html.Node {
	return func(root *html.Node) *html.Node {
		var found *html.Node
		var walk func(*html.Node)
		walk = func(n *html.Node) {
			if found != nil {
				return
			}
			if n.Type == html.ElementNode && strings.EqualFold(n.Data, tag) && strings.Contains(nodeText(n), text) {
				found = n
				return
			}
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				walk(c)
			}
		}
		walk(root)
		return found
	}
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

type binding struct {
	Selector   string   `json:"selector"`
	Status     string   `json:"status"`
	Category   string   `json:"category"`
	Confidence int      `json:"confidence"`
	Reasons    []string `json:"reasons"`
}

func bindings() []binding {
	var out struct {
		Bindings []binding `json:"bindings"`
	}
	do("GET", base+"/api/v1/sites/"+siteID+"/health", nil, nil, &out)
	return out.Bindings
}

func findBinding(bs []binding, sel string) *binding {
	for i := range bs {
		if bs[i].Selector == sel {
			return &bs[i]
		}
	}
	return nil
}

func setupSite() {
	// create a dedicated eval site if not present
	var sites []struct {
		ID, SiteKey, Name string
	}
	do("GET", base+"/api/v1/sites", nil, nil, &sites)
	for _, s := range sites {
		if s.Name == "Eval Archetypes" {
			siteID = s.ID
		}
	}
	if siteID == "" {
		var out struct{ ID string }
		do("POST", base+"/api/v1/sites", nil, map[string]string{"name": "Eval Archetypes", "origin": origin}, &out)
		siteID = out.ID
	} else {
		// ensure origin registered
		do("POST", base+"/api/v1/sites/"+siteID+"/origins", nil, map[string]string{"origin": origin}, nil)
	}
	var tk struct{ Token string }
	do("POST", base+"/api/v1/sites/"+siteID+"/edit-token", nil, map[string]any{}, &tk)
	token = tk.Token
}

func resetSite() { do("POST", base+"/api/v1/sites/"+siteID+"/reset", nil, nil, nil) }

func putContent(path, selector, text, descriptor string) {
	do("PUT", base+"/api/v1/edit/content", bearer(), map[string]any{
		"path": path, "selector": selector,
		"content":    map[string]any{"text": text},
		"descriptor": json.RawMessage(descriptor),
		"risk":       map[string]any{"confidence": 100, "reasons": []string{}},
	}, nil)
}

func publish(path string) {
	do("POST", base+"/api/v1/edit/publish", bearer(), map[string]string{"path": path}, nil)
}

func scan() { do("POST", base+"/api/v1/sites/"+siteID+"/health/scan", nil, map[string]any{}, nil) }

func login() {
	do("POST", base+"/api/v1/auth/login", nil, map[string]string{"email": email, "password": password}, nil)
}

func bearer() map[string]string { return map[string]string{"Authorization": "Bearer " + token} }

func do(method, url string, headers map[string]string, body, out any) {
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
		fmt.Fprintln(os.Stderr, method, url, err)
		return
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		fmt.Fprintf(os.Stderr, "%s %s -> %d %s\n", method, url, resp.StatusCode, truncate(string(data)))
		return
	}
	if out != nil {
		_ = json.Unmarshal(data, out)
	}
}

func truncate(s string) string {
	if len(s) > 120 {
		return s[:120]
	}
	return s
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
