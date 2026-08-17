package sanitize

import "testing"

func TestHTMLStripsDangerousContent(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"script dropped, text kept", `hi<script>alert(1)</script> there`, `hi there`},
		{"event handler stripped", `<b onclick="evil()">x</b>`, `<b>x</b>`},
		{"javascript href stripped", `<a href="javascript:alert(1)">x</a>`, `<a>x</a>`},
		{"data href stripped", `<a href="data:text/html,evil">x</a>`, `<a>x</a>`},
		{"safe link kept", `<a href="https://a.com" title="t">x</a>`, `<a href="https://a.com" title="t">x</a>`},
		{"disallowed tag unwrapped", `<div><img src=x onerror=alert(1)>text</div>`, `text`},
		{"style url() stripped", `<span style="background-color: url(evil)">x</span>`, `<span>x</span>`},
		{"safe inline style kept", `<span style="color: red">x</span>`, `<span style="color: red">x</span>`},
		{"disallowed style prop stripped", `<span style="position: fixed; color: red">x</span>`, `<span style="color: red">x</span>`},
		{"blank target gets safe rel", `<a href="/x" target="_blank">x</a>`, `<a href="/x" target="_blank" rel="noopener noreferrer">x</a>`},
		{"nested formatting kept", `<b>a<i>b</i></b>`, `<b>a<i>b</i></b>`},
		{"text escaped", `<b>a & <b</b>`, `<b>a &amp; </b>`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := HTML(c.in); got != c.want {
				t.Errorf("HTML(%q)\n  got  %q\n  want %q", c.in, got, c.want)
			}
		})
	}
}

func TestAttrsAllowlist(t *testing.T) {
	got := Attrs(map[string]string{
		"src":     "https://a.com/x.png",
		"href":    "javascript:alert(1)",
		"onclick": "evil()",
		"alt":     "photo",
		"srcset":  "", // empty preserved as remove-signal
	})
	if got["src"] != "https://a.com/x.png" {
		t.Errorf("src dropped: %v", got)
	}
	if _, ok := got["href"]; ok {
		t.Errorf("javascript href kept: %v", got)
	}
	if _, ok := got["onclick"]; ok {
		t.Errorf("onclick kept: %v", got)
	}
	if v, ok := got["srcset"]; !ok || v != "" {
		t.Errorf("empty srcset signal lost: %v", got)
	}
}

func TestStyleAllowlist(t *testing.T) {
	got := Style(map[string]string{
		"color":         "red",
		"position":      "fixed",
		"background":    "url(evil)",
		"padding-top":   "10px",
		"border-radius": "",
	})
	if got["color"] != "red" || got["padding-top"] != "10px" {
		t.Errorf("safe props dropped: %v", got)
	}
	if _, ok := got["position"]; ok {
		t.Errorf("position kept: %v", got)
	}
	if _, ok := got["background"]; ok {
		t.Errorf("unsafe background kept: %v", got)
	}
	if v, ok := got["border-radius"]; !ok || v != "" {
		t.Errorf("empty clear-signal lost: %v", got)
	}
}
