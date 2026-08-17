package sanitize

import "testing"

func TestSVG_AllowsCleanImage(t *testing.T) {
	clean := []byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
		`<path d="M4 4h16v16H4z" fill="#f00"/><circle cx="12" cy="12" r="5"/></svg>`)
	out, err := SVG(clean)
	if err != nil {
		t.Fatalf("clean SVG rejected: %v", err)
	}
	if string(out) != string(clean) {
		t.Fatalf("clean SVG altered:\n%s", out)
	}
}

func TestSVG_RejectsActiveContent(t *testing.T) {
	cases := map[string]string{
		"script tag": `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`,
		"uppercase script": `<svg xmlns="http://www.w3.org/2000/svg"><SCRIPT>alert(1)</SCRIPT></svg>`,
		"onload handler": `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>`,
		"onclick on child": `<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="x()"/></svg>`,
		"foreignObject": `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body onload="x()"/></foreignObject></svg>`,
		"javascript href": `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a></svg>`,
		"xlink javascript": `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:x()"><rect/></a></svg>`,
		"doctype entity": `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"/>`,
		"data html href": `<svg xmlns="http://www.w3.org/2000/svg"><a href="data:text/html,<script>x</script>"><rect/></a></svg>`,
	}
	for name, in := range cases {
		if _, err := SVG([]byte(in)); err == nil {
			t.Errorf("%s: expected rejection, got none", name)
		}
	}
}

func TestSVG_AllowsSafeHrefsAndDataImages(t *testing.T) {
	cases := []string{
		`<svg xmlns="http://www.w3.org/2000/svg"><a href="https://example.com"><rect/></a></svg>`,
		`<svg xmlns="http://www.w3.org/2000/svg"><a href="/local/path"><rect/></a></svg>`,
		`<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,iVBORw0KGgo="/></svg>`,
	}
	for _, in := range cases {
		if _, err := SVG([]byte(in)); err != nil {
			t.Errorf("safe SVG rejected: %v\n%s", err, in)
		}
	}
}

func TestSVG_RejectsNonSVG(t *testing.T) {
	if _, err := SVG([]byte(`<html><body>nope</body></html>`)); err == nil {
		t.Error("non-SVG XML accepted as SVG")
	}
	if _, err := SVG([]byte(`not xml at all`)); err == nil {
		t.Error("non-XML accepted as SVG")
	}
}
