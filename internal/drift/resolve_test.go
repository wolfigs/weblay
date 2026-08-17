package drift

import (
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func parse(t *testing.T, s string) *html.Node {
	t.Helper()
	doc, err := html.Parse(strings.NewReader(s))
	if err != nil {
		t.Fatal(err)
	}
	return doc
}

func TestResolveByWeblayName(t *testing.T) {
	doc := parse(t, `<html><body><section><h1 data-weblay="title">Hi</h1></section></body></html>`)
	r := Resolve(doc, `{"v":1,"weblay":"title","path":"[data-weblay=\"title\"]","fp":{"tag":"H1","textHash":"","attrHash":"","index":0,"landmark":"section"}}`)
	if r.Status != statusHealthy || r.Confidence < 90 {
		t.Fatalf("want healthy/high, got %+v", r)
	}
}

func TestResolveMissing(t *testing.T) {
	doc := parse(t, `<html><body><p>nothing here</p></body></html>`)
	r := Resolve(doc, `{"v":1,"weblay":"gone","path":"[data-weblay=\"gone\"]","fp":{"tag":"H1"}}`)
	if r.Status != statusBroken {
		t.Fatalf("want broken, got %+v", r)
	}
}

func TestResolveDuplicateAnchorQuarantines(t *testing.T) {
	doc := parse(t, `<html><body><span data-weblay="dup">a</span><span data-weblay="dup">b</span></body></html>`)
	r := Resolve(doc, `{"v":1,"weblay":"dup","path":"x","fp":{"tag":"SPAN"}}`)
	if r.Status != statusQuarantined {
		t.Fatalf("want quarantined for duplicate, got %+v", r)
	}
}

func TestResolveByStructuralPath(t *testing.T) {
	doc := parse(t, `<html><body><section><h1>A</h1><p>hello world</p></section></body></html>`)
	// path targets the <p>; no data-weblay.
	desc := `{"v":1,"path":"body > section:nth-of-type(1) > p:nth-of-type(1)","fp":{"tag":"P","textHash":"` +
		textHashOf("hello world") + `","attrHash":"","index":0,"landmark":"section"}}`
	r := Resolve(doc, desc)
	if r.Status != statusHealthy {
		t.Fatalf("want healthy via path, got %+v", r)
	}
}

// TestResolveNoDescriptorIsHealthy guards the false-alarm fix: a binding with no
// usable descriptor must be treated as unknown/healthy, never an invented
// content-conflict (which used to fabricate a full-revamp across seeded sites).
func TestResolveNoDescriptorIsHealthy(t *testing.T) {
	doc := parse(t, `<html><body><p>anything</p></body></html>`)
	r := Resolve(doc, ``)
	if r.Status != statusHealthy || r.Category != CatUnknown {
		t.Fatalf("want healthy/unknown for no-descriptor, got %+v", r)
	}
}

// TestResolveMoveNotConflict guards the move-vs-conflict fix: when a same-tag
// sibling shifts into the anchored slot but the original content still resolves
// uniquely elsewhere, it's a move, not an in-place content edit.
func TestResolveMoveNotConflict(t *testing.T) {
	// Descriptor anchored to the first <a> ("See the menu"); after a reorder the
	// slot holds "Our story" and the original text lives in the second <a>.
	doc := parse(t, `<html><body><nav><a>Our story</a><a>See the menu</a></nav></body></html>`)
	desc := `{"v":1,"path":"body > nav:nth-of-type(1) > a:nth-of-type(1)","fp":{"tag":"A","textHash":"` +
		textHashOf("See the menu") + `","attrHash":"","landmark":"nav"}}`
	r := Resolve(doc, desc)
	if r.Category != CatMoved {
		t.Fatalf("want moved for slot-reuse reorder, got %+v", r)
	}
}

// TestResolveAttrLookalikeIsAmbiguous guards the removed-vs-moved fix: when the
// anchor is gone and only a shared-attribute look-alike (reused class, different
// text) remains, we must flag ambiguous — never confidently "rebind" onto it.
func TestResolveAttrLookalikeIsAmbiguous(t *testing.T) {
	// Anchor targeted a span.eyebrow that was deleted; another span.eyebrow with
	// different text remains elsewhere.
	doc := parse(t, `<html><body><section><span class="eyebrow" role="note">Our craft</span></section></body></html>`)
	attr := attrSignatureHash(&html.Node{
		Type: html.ElementNode, Data: "span",
		Attr: []html.Attribute{{Key: "class", Val: "eyebrow"}, {Key: "role", Val: "note"}},
	})
	desc := `{"v":1,"weblay":"gone-eyebrow","path":"[data-weblay=\"gone-eyebrow\"]","fp":{"tag":"SPAN","textHash":"` +
		textHashOf("Roasted daily in Lakeview") + `","attrHash":"` + attr + `","landmark":"section"}}`
	r := Resolve(doc, desc)
	if r.Category != CatAmbiguous {
		t.Fatalf("want ambiguous for attr-lookalike, got %+v", r)
	}
}

// textHashOf mirrors the client textHash for a plain string (already normalized).
func textHashOf(s string) string {
	n := &html.Node{Type: html.ElementNode, Data: "p"}
	n.AppendChild(&html.Node{Type: html.TextNode, Data: s})
	return textHash(n)
}
