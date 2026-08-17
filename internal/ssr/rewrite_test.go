package ssr

import (
	"strings"
	"testing"
)

func strp(s string) *string { return &s }

// contains asserts the rendered HTML contains a substring — the SEO-critical
// property: edited content must be literally present in the server's bytes.
func mustContain(t *testing.T, out, want string) {
	t.Helper()
	if !strings.Contains(out, want) {
		t.Fatalf("output missing %q\n--- output ---\n%s", want, out)
	}
}

func mustNotContain(t *testing.T, out, notWant string) {
	t.Helper()
	if strings.Contains(out, notWant) {
		t.Fatalf("output unexpectedly contains %q\n--- output ---\n%s", notWant, out)
	}
}

func rewrite(t *testing.T, src string, m *Manifest) string {
	t.Helper()
	out, err := Rewrite([]byte(src), m)
	if err != nil {
		t.Fatalf("Rewrite: %v", err)
	}
	return string(out)
}

func man(elems map[string]*ElementContent) *Manifest {
	return &Manifest{Version: 1, Elements: elems}
}

// The headline case: a data-weblay title is rewritten server-side, so a
// JS-blind crawler reading the raw HTML sees the edited text, not the original.
func TestWeblayAnchor_TextEditVisibleInHTML(t *testing.T) {
	src := `<!doctype html><html><head><title>t</title></head><body>` +
		`<h1 data-weblay="hero-title">Original heading</h1></body></html>`
	out := rewrite(t, src, man(map[string]*ElementContent{
		`[data-weblay="hero-title"]`: {Text: strp("Edited heading")},
	}))
	mustContain(t, out, "Edited heading")
	mustNotContain(t, out, "Original heading")
	// Structure preserved: still the same h1 with its anchor.
	mustContain(t, out, `<h1 data-weblay="hero-title">Edited heading</h1>`)
}

func TestHTMLWinsOverText(t *testing.T) {
	src := `<html><body><p data-weblay="body">old</p></body></html>`
	out := rewrite(t, src, man(map[string]*ElementContent{
		`[data-weblay="body"]`: {Text: strp("plain"), HTML: strp("rich <strong>bold</strong>")},
	}))
	mustContain(t, out, "rich <strong>bold</strong>")
	mustNotContain(t, out, "plain")
}

func TestHTMLIsSanitized(t *testing.T) {
	src := `<html><body><div data-weblay="x">old</div></body></html>`
	out := rewrite(t, src, man(map[string]*ElementContent{
		`[data-weblay="x"]`: {HTML: strp(`ok<script>alert(1)</script><b>keep</b>`)},
	}))
	mustContain(t, out, "<b>keep</b>")
	mustNotContain(t, out, "<script>")
	mustNotContain(t, out, "alert(1)")
}

func TestStructuralPath_NthOfType(t *testing.T) {
	src := `<html><body><main>` +
		`<section><p>first</p><p>second</p><p>third</p></section>` +
		`</main></body></html>`
	// Edit the SECOND <p>: body > main:1 > section:1 > p:2
	sel := `body > main:nth-of-type(1) > section:nth-of-type(1) > p:nth-of-type(2)`
	out := rewrite(t, src, man(map[string]*ElementContent{
		sel: {Text: strp("SECOND-EDITED")},
	}))
	mustContain(t, out, "SECOND-EDITED")
	mustContain(t, out, "first")
	mustContain(t, out, "third")
	mustNotContain(t, out, "second") // only the 2nd p changed
}

func TestStructuralPath_IdAnchored(t *testing.T) {
	src := `<html><body><div id="hero"><h1>title</h1></div>` +
		`<div id="other"><h1>title</h1></div></body></html>`
	// #hero > h1:1 must match ONLY the h1 inside #hero.
	out := rewrite(t, src, man(map[string]*ElementContent{
		`#hero > h1:nth-of-type(1)`: {Text: strp("hero-edited")},
	}))
	mustContain(t, out, "hero-edited")
	// The other h1 (same tag/text, different parent) is untouched.
	mustContain(t, out, `<div id="other"><h1>title</h1></div>`)
}

func TestAmbiguousSelectorSkipped(t *testing.T) {
	// Two elements share the anchor: applying would be ambiguous -> skip.
	src := `<html><body><span data-weblay="dup">a</span>` +
		`<span data-weblay="dup">b</span></body></html>`
	out := rewrite(t, src, man(map[string]*ElementContent{
		`[data-weblay="dup"]`: {Text: strp("EDITED")},
	}))
	mustNotContain(t, out, "EDITED")
	mustContain(t, out, ">a<")
	mustContain(t, out, ">b<")
}

func TestMissingSelectorSkipped(t *testing.T) {
	src := `<html><body><p data-weblay="present">x</p></body></html>`
	out := rewrite(t, src, man(map[string]*ElementContent{
		`[data-weblay="absent"]`: {Text: strp("EDITED")},
	}))
	mustNotContain(t, out, "EDITED")
	mustContain(t, out, ">x<")
}

func TestAttrs_SetAndRemove(t *testing.T) {
	src := `<html><body>` +
		`<img data-weblay="pic" src="old.jpg" srcset="old-2x.jpg" alt="old">` +
		`</body></html>`
	out := rewrite(t, src, man(map[string]*ElementContent{
		`[data-weblay="pic"]`: {Attrs: map[string]string{
			"src":    "new.jpg",
			"alt":    "new alt",
			"srcset": "", // empty = remove
		}},
	}))
	mustContain(t, out, `src="new.jpg"`)
	mustContain(t, out, `alt="new alt"`)
	mustNotContain(t, out, "srcset")
	mustNotContain(t, out, "old.jpg")
}

func TestAttrs_DisallowedDropped(t *testing.T) {
	src := `<html><body><a data-weblay="l" href="/old">x</a></body></html>`
	out := rewrite(t, src, man(map[string]*ElementContent{
		`[data-weblay="l"]`: {Attrs: map[string]string{
			"href":    "javascript:alert(1)", // unsafe scheme -> dropped
			"onclick": "steal()",             // not allowlisted -> dropped
		}},
	}))
	mustNotContain(t, out, "javascript:")
	mustNotContain(t, out, "onclick")
	mustContain(t, out, `href="/old"`) // original kept since edit was rejected
}

func TestBaseStyleMergedInline(t *testing.T) {
	src := `<html><body><p data-weblay="s" style="margin: 0">x</p></body></html>`
	out := rewrite(t, src, man(map[string]*ElementContent{
		`[data-weblay="s"]`: {Style: map[string]string{
			"color":  "red",
			"margin": "10px", // overrides existing inline margin
		}},
	}))
	mustContain(t, out, "color: red")
	mustContain(t, out, "margin: 10px")
	mustNotContain(t, out, "margin: 0")
}

func TestResponsiveMediaStylesheet(t *testing.T) {
	src := `<html><head></head><body><p data-weblay="r">x</p></body></html>`
	out := rewrite(t, src, man(map[string]*ElementContent{
		`[data-weblay="r"]`: {Media: map[string]map[string]string{
			"640":  {"font-size": "14px"},
			"1024": {"font-size": "18px"},
		}},
	}))
	mustContain(t, out, `id="weblay-media"`)
	mustContain(t, out, "@media (max-width:1024px)")
	mustContain(t, out, "@media (max-width:640px)")
	mustContain(t, out, "font-size:18px!important")
	mustContain(t, out, "font-size:14px!important")
	// Widest-first ordering: 1024 block precedes 640 block.
	if strings.Index(out, "max-width:1024px") > strings.Index(out, "max-width:640px") {
		t.Fatal("media blocks not ordered widest-first")
	}
}

func TestMediaStylesheetCreatedWhenNoHead(t *testing.T) {
	src := `<html><body><p data-weblay="r">x</p></body></html>`
	out := rewrite(t, src, man(map[string]*ElementContent{
		`[data-weblay="r"]`: {Media: map[string]map[string]string{"640": {"color": "blue"}}},
	}))
	mustContain(t, out, "<head>")
	mustContain(t, out, `id="weblay-media"`)
	mustContain(t, out, "color:blue!important")
}

func TestNilAndEmptyManifestPassthrough(t *testing.T) {
	src := `<html><body><p>x</p></body></html>`
	if got, _ := Rewrite([]byte(src), nil); string(got) != src {
		t.Fatal("nil manifest should pass input through unchanged")
	}
	if got, _ := Rewrite([]byte(src), man(nil)); string(got) != src {
		t.Fatal("empty manifest should pass input through unchanged")
	}
}

func TestCSSUnescapeAnchorName(t *testing.T) {
	// A name with a dot: selector.ts writes [data-weblay="hero\.title"]; the
	// live attribute value is the literal "hero.title".
	src := `<html><body><h1 data-weblay="hero.title">old</h1></body></html>`
	out := rewrite(t, src, man(map[string]*ElementContent{
		`[data-weblay="hero\.title"]`: {Text: strp("dotted-edited")},
	}))
	mustContain(t, out, "dotted-edited")
}

func TestTextContentIsEscaped(t *testing.T) {
	// textContent must be escaped in output, never injected as markup.
	src := `<html><body><p data-weblay="t">x</p></body></html>`
	out := rewrite(t, src, man(map[string]*ElementContent{
		`[data-weblay="t"]`: {Text: strp("<b>not bold</b> & fine")},
	}))
	mustContain(t, out, "&lt;b&gt;not bold&lt;/b&gt; &amp; fine")
	mustNotContain(t, out, "<b>not bold</b>")
}

func TestMultipleEditsDeterministic(t *testing.T) {
	src := `<html><body>` +
		`<h1 data-weblay="a">A</h1><h2 data-weblay="b">B</h2></body></html>`
	m := man(map[string]*ElementContent{
		`[data-weblay="a"]`: {Text: strp("AA")},
		`[data-weblay="b"]`: {Text: strp("BB")},
	})
	first := rewrite(t, src, m)
	for i := 0; i < 20; i++ {
		if got := rewrite(t, src, m); got != first {
			t.Fatal("rewrite is not deterministic across runs")
		}
	}
	mustContain(t, first, "AA")
	mustContain(t, first, "BB")
}
