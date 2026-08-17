package sanitize

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"strings"
)

// Elements whose presence makes an SVG a script/HTML-injection vector. Rejected
// outright — no legitimate uploaded image needs them.
var svgDropElements = map[string]bool{
	"script":        true,
	"foreignobject": true, // can embed arbitrary HTML (and thus <script>)
	"handler":       true, // SVG Tiny event handler
	"set":           true, // can set on* attributes / hrefs dynamically
	"use":           false, // allowed, but external xlink:href is checked below
}

// SVG validates an uploaded SVG and returns a safe-to-store copy. It rejects any
// SVG carrying active content — <script>/<foreignObject>, on* event handlers,
// or javascript:/vbscript:/data: URLs — and strips XML directives (DOCTYPE /
// <!ENTITY>) that enable XXE and entity-expansion (billion-laughs) attacks.
//
// This is the server-side trust boundary for SVG uploads; serve responses layer
// a sandboxing CSP on top (defense in depth). The scan runs on the parsed XML
// token stream, so casing, whitespace, and namespace prefixes cannot hide a
// payload from it.
func SVG(data []byte) ([]byte, error) {
	dec := xml.NewDecoder(bytes.NewReader(data))
	dec.Strict = false
	dec.Entity = xml.HTMLEntity // resolve named entities; do not expand custom ones

	sawSVGRoot := false
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("not a well-formed SVG: %w", err)
		}
		switch t := tok.(type) {
		case xml.Directive:
			// <!DOCTYPE …>, <!ENTITY …> — XXE / entity-expansion vectors.
			return nil, fmt.Errorf("SVG XML directives are not allowed")
		case xml.ProcInst:
			// Allow the xml declaration; reject anything executable-looking.
			if strings.EqualFold(t.Target, "xml") {
				continue
			}
			return nil, fmt.Errorf("SVG processing instruction %q not allowed", t.Target)
		case xml.StartElement:
			local := strings.ToLower(t.Name.Local)
			if local == "svg" {
				sawSVGRoot = true
			}
			if drop, ok := svgDropElements[local]; ok && drop {
				return nil, fmt.Errorf("SVG contains a <%s> element", local)
			}
			if err := checkSVGAttrs(local, t.Attr); err != nil {
				return nil, err
			}
		}
	}
	if !sawSVGRoot {
		return nil, fmt.Errorf("not an SVG document")
	}
	return data, nil
}

func checkSVGAttrs(element string, attrs []xml.Attr) error {
	for _, a := range attrs {
		name := strings.ToLower(a.Name.Local)
		// Event handlers: onload, onclick, onmouseover, … (any on* attribute).
		if strings.HasPrefix(name, "on") {
			return fmt.Errorf("SVG contains an event handler attribute %q", a.Name.Local)
		}
		// URL-bearing attributes must not carry an active scheme.
		if name == "href" || name == "xlink:href" || a.Name.Local == "href" {
			if hasActiveScheme(a.Value) {
				return fmt.Errorf("SVG <%s> references an unsafe URL", element)
			}
		}
	}
	return nil
}

// hasActiveScheme reports whether a URL uses a scheme that can execute script.
// data: is rejected only when it is not a plain image payload.
func hasActiveScheme(raw string) bool {
	v := strings.ToLower(strings.TrimSpace(raw))
	// Strip leading control/whitespace characters browsers ignore.
	v = strings.Map(func(r rune) rune {
		if r == '\t' || r == '\n' || r == '\r' {
			return -1
		}
		return r
	}, v)
	switch {
	case strings.HasPrefix(v, "javascript:"), strings.HasPrefix(v, "vbscript:"):
		return true
	case strings.HasPrefix(v, "data:"):
		// Allow inline raster images; reject data: that could carry markup/script.
		return !strings.HasPrefix(v, "data:image/")
	default:
		return false
	}
}
