// Package sanitize is the server-side trust boundary for editor-supplied
// content. Every draft passes through here before it is stored, independent of
// the connector's client-side sanitizer — neither trusts the other.
//
// The allowlists deliberately mirror connector/src/sanitize.ts. Keep them in
// sync: a tag or property allowed on one side but not the other is a bug.
package sanitize

import (
	"regexp"
	"sort"
	"strings"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// Inline formatting tags allowed in rich text. Anything else is unwrapped
// (children kept, tag dropped) so text is never lost.
var tagAllow = map[string]bool{
	"a": true, "b": true, "strong": true, "i": true, "em": true, "u": true,
	"s": true, "strike": true, "del": true, "ins": true, "code": true,
	"mark": true, "sub": true, "sup": true, "small": true, "span": true,
	"br": true, "abbr": true, "q": true,
}

var voidTags = map[string]bool{"br": true}

// Tags whose contents are dropped entirely (not unwrapped) — their text is
// code or metadata, never display content.
var dropTags = map[string]bool{
	"script": true, "style": true, "noscript": true, "iframe": true,
	"object": true, "embed": true, "template": true, "textarea": true,
	"title": true, "head": true, "svg": true, "math": true,
}

// Per-tag attribute allowlist (besides the global style attribute).
var attrAllow = map[string]map[string]bool{
	"a":    {"href": true, "target": true, "rel": true, "title": true},
	"abbr": {"title": true},
}

// Inline-style properties allowed on rich-text spans.
var inlineStyleAllow = map[string]bool{
	"color": true, "background-color": true, "font-weight": true,
	"font-style": true, "text-decoration": true, "text-decoration-line": true,
	"text-transform": true, "font-size": true,
}

// Element-level style properties the panel/runtime may set. Superset of inline.
var elementStyleAllow = map[string]bool{
	"padding": true, "padding-top": true, "padding-right": true, "padding-bottom": true, "padding-left": true,
	"margin": true, "margin-top": true, "margin-right": true, "margin-bottom": true, "margin-left": true,
	"width": true, "height": true, "max-width": true, "max-height": true, "min-width": true, "min-height": true,
	"object-fit": true, "object-position": true,
	"color": true, "background-color": true, "font-size": true, "font-weight": true, "font-style": true,
	"line-height": true, "letter-spacing": true, "text-align": true, "text-transform": true,
	"text-decoration": true, "font-family": true,
	"border-radius": true, "opacity": true,
}

// Element-level content attributes (ElementContent.Attrs) allowlist.
var contentAttrAllow = map[string]bool{
	"src": true, "srcset": true, "alt": true, "title": true, "href": true,
	"target": true, "rel": true, "aria-label": true, "placeholder": true,
}

var (
	unsafeURL   = regexp.MustCompile(`(?i)^\s*(javascript|data|vbscript|file)\s*:`)
	unsafeCSS   = regexp.MustCompile(`(?i)url\s*\(|expression\s*\(|javascript\s*:|@import|[<>]`)
	unsafeAttrV = regexp.MustCompile(`(?i)^\s*(javascript|data|vbscript):`)
)

// HTML parses an untrusted fragment and returns an allowlisted serialization.
func HTML(input string) string {
	ctx := &html.Node{Type: html.ElementNode, Data: "div", DataAtom: atom.Div}
	nodes, err := html.ParseFragment(strings.NewReader(input), ctx)
	if err != nil {
		return ""
	}
	var b strings.Builder
	for _, n := range nodes {
		renderClean(&b, n, 0)
	}
	return b.String()
}

func renderClean(b *strings.Builder, n *html.Node, depth int) {
	if depth > 32 {
		return
	}
	switch n.Type {
	case html.TextNode:
		b.WriteString(html.EscapeString(n.Data))
		return
	case html.ElementNode:
		// ok
	default:
		return // comments, doctype, etc.
	}

	tag := strings.ToLower(n.Data)
	if dropTags[tag] {
		return // drop tag and its contents
	}
	if !tagAllow[tag] {
		// Unwrap: keep children, drop the tag.
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			renderClean(b, c, depth+1)
		}
		return
	}

	b.WriteString("<")
	b.WriteString(tag)
	for _, a := range cleanAttrs(tag, n.Attr) {
		b.WriteString(" ")
		b.WriteString(a.key)
		b.WriteString(`="`)
		b.WriteString(html.EscapeString(a.val))
		b.WriteString(`"`)
	}
	b.WriteString(">")

	if voidTags[tag] {
		return
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		renderClean(b, c, depth+1)
	}
	b.WriteString("</")
	b.WriteString(tag)
	b.WriteString(">")
}

type kv struct{ key, val string }

func cleanAttrs(tag string, attrs []html.Attribute) []kv {
	allow := attrAllow[tag]
	var out []kv
	var hasBlankTarget bool
	for _, a := range attrs {
		name := strings.ToLower(a.Key)
		if name == "style" {
			if v := inlineStyle(a.Val); v != "" {
				out = append(out, kv{"style", v})
			}
			continue
		}
		if allow == nil || !allow[name] {
			continue
		}
		if name == "href" && unsafeURL.MatchString(a.Val) {
			continue
		}
		if name == "target" && a.Val == "_blank" {
			hasBlankTarget = true
		}
		out = append(out, kv{name, a.Val})
	}
	// Links opening a new tab always get a safe rel.
	if tag == "a" && hasBlankTarget {
		out = removeKey(out, "rel")
		out = append(out, kv{"rel", "noopener noreferrer"})
	}
	return out
}

func removeKey(list []kv, key string) []kv {
	out := list[:0]
	for _, k := range list {
		if k.key != key {
			out = append(out, k)
		}
	}
	return out
}

// inlineStyle filters a style attribute down to safe inline declarations.
func inlineStyle(style string) string {
	return filterStyle(style, inlineStyleAllow)
}

func filterStyle(style string, allow map[string]bool) string {
	var decls []string
	for _, decl := range strings.Split(style, ";") {
		i := strings.Index(decl, ":")
		if i < 0 {
			continue
		}
		prop := strings.ToLower(strings.TrimSpace(decl[:i]))
		val := strings.TrimSpace(decl[i+1:])
		if val == "" || !allow[prop] || unsafeCSS.MatchString(val) {
			continue
		}
		decls = append(decls, prop+": "+val)
	}
	return strings.Join(decls, "; ")
}

// Attrs returns a sanitized copy of element-level content attributes.
func Attrs(in map[string]string) map[string]string {
	if in == nil {
		return nil
	}
	out := make(map[string]string, len(in))
	for _, key := range sortedKeys(in) {
		name := strings.ToLower(key)
		val := in[key]
		if val == "" {
			out[name] = "" // empty = "remove attribute" signal; preserve it
			continue
		}
		if !contentAttrAllow[name] {
			continue
		}
		if (name == "href" || name == "src") && unsafeAttrV.MatchString(val) {
			continue
		}
		out[name] = val
	}
	return out
}

// Style returns a sanitized copy of element-level inline styles.
func Style(in map[string]string) map[string]string {
	if in == nil {
		return nil
	}
	out := make(map[string]string, len(in))
	for _, key := range sortedKeys(in) {
		prop := strings.ToLower(strings.TrimSpace(key))
		val := in[key]
		if val == "" {
			out[prop] = "" // empty = clear property; preserve it
			continue
		}
		if !elementStyleAllow[prop] || unsafeCSS.MatchString(val) {
			continue
		}
		out[prop] = val
	}
	return out
}

func sortedKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
