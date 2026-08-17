package ssr

import (
	"strconv"
	"strings"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// --- DOM mutation helpers ---------------------------------------------------

// setTextContent replaces an element's children with a single text node,
// mirroring `el.textContent = s`. html.Render escapes the text on output.
func setTextContent(el *html.Node, s string) {
	clearChildren(el)
	el.AppendChild(&html.Node{Type: html.TextNode, Data: s})
}

// setInnerHTML replaces an element's children with the parsed fragment of
// (already-sanitized) HTML, mirroring `el.innerHTML = s`.
func setInnerHTML(el *html.Node, fragment string) {
	nodes, err := html.ParseFragment(strings.NewReader(fragment), el)
	if err != nil {
		// Sanitized fragment failed to parse: fall back to treating it as text
		// rather than leaving stale content or breaking the page.
		setTextContent(el, fragment)
		return
	}
	clearChildren(el)
	for _, n := range nodes {
		el.AppendChild(n)
	}
}

func clearChildren(el *html.Node) {
	for c := el.FirstChild; c != nil; c = el.FirstChild {
		el.RemoveChild(c)
	}
}

func getAttr(n *html.Node, key string) (string, bool) {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val, true
		}
	}
	return "", false
}

func setAttr(n *html.Node, key, val string) {
	for i := range n.Attr {
		if n.Attr[i].Key == key {
			n.Attr[i].Val = val
			return
		}
	}
	n.Attr = append(n.Attr, html.Attribute{Key: key, Val: val})
}

func removeAttr(n *html.Node, key string) {
	out := n.Attr[:0]
	for _, a := range n.Attr {
		if a.Key != key {
			out = append(out, a)
		}
	}
	n.Attr = out
}

// mergeInlineStyle applies base style declarations to the element's inline
// style attribute with setProperty semantics: an existing property is updated
// in place, a new one is appended, preserving source order.
func mergeInlineStyle(el *html.Node, styles map[string]string) {
	existing, _ := getAttr(el, "style")
	decls := parseInlineStyle(existing)

	keys := make([]string, 0, len(styles))
	for k := range styles {
		keys = append(keys, k)
	}
	// Deterministic append order for props not already present.
	sortStrings(keys)

	for _, prop := range keys {
		val := styles[prop]
		if val == "" {
			continue // base tier: empty carries no effect (see applyContent)
		}
		replaced := false
		for i := range decls {
			if decls[i].prop == prop {
				decls[i].val = val
				replaced = true
				break
			}
		}
		if !replaced {
			decls = append(decls, styleDecl{prop, val})
		}
	}
	setAttr(el, "style", serializeInlineStyle(decls))
}

type styleDecl struct{ prop, val string }

func parseInlineStyle(s string) []styleDecl {
	var out []styleDecl
	for _, part := range strings.Split(s, ";") {
		i := strings.Index(part, ":")
		if i < 0 {
			continue
		}
		prop := strings.ToLower(strings.TrimSpace(part[:i]))
		val := strings.TrimSpace(part[i+1:])
		if prop == "" || val == "" {
			continue
		}
		out = append(out, styleDecl{prop, val})
	}
	return out
}

func serializeInlineStyle(decls []styleDecl) string {
	parts := make([]string, 0, len(decls))
	for _, d := range decls {
		parts = append(parts, d.prop+": "+d.val)
	}
	return strings.Join(parts, "; ")
}

// setStyleSheet injects (or replaces) a <style id=...> node in <head> with the
// given CSS, mirroring runtime.ts injectStyleSheet.
func setStyleSheet(doc *html.Node, id, css string) {
	head := findFirst(doc, func(n *html.Node) bool {
		return n.Type == html.ElementNode && n.DataAtom == atom.Head
	})
	if head == nil {
		head = ensureHead(doc)
	}
	if head == nil {
		return // malformed document with no <html>; nothing safe to do
	}
	// Reuse an existing weblay-media style node if present.
	if node := findFirst(head, func(n *html.Node) bool {
		if n.Type != html.ElementNode || n.DataAtom != atom.Style {
			return false
		}
		v, _ := getAttr(n, "id")
		return v == id
	}); node != nil {
		clearChildren(node)
		node.AppendChild(&html.Node{Type: html.TextNode, Data: css})
		return
	}
	style := &html.Node{
		Type:     html.ElementNode,
		Data:     "style",
		DataAtom: atom.Style,
		Attr:     []html.Attribute{{Key: "id", Val: id}},
	}
	style.AppendChild(&html.Node{Type: html.TextNode, Data: css})
	head.AppendChild(style)
}

func ensureHead(doc *html.Node) *html.Node {
	htmlEl := findFirst(doc, func(n *html.Node) bool {
		return n.Type == html.ElementNode && n.DataAtom == atom.Html
	})
	if htmlEl == nil {
		return nil
	}
	head := &html.Node{Type: html.ElementNode, Data: "head", DataAtom: atom.Head}
	if htmlEl.FirstChild != nil {
		htmlEl.InsertBefore(head, htmlEl.FirstChild)
	} else {
		htmlEl.AppendChild(head)
	}
	return head
}

// --- selector matching ------------------------------------------------------

// match reproduces document.querySelectorAll for the exact selector grammar
// connector/src/selector.ts emits, and nothing else:
//
//	[data-weblay="NAME"]                          (authored anchor)
//	body > tag:nth-of-type(N) > ... > tag:nth-of-type(M)
//	#id > tag:nth-of-type(N) > ...                (id-anchored structural path)
//
// Every combinator is a direct-child ">", so a structural path is a strict
// parent chain and can be verified by walking up from a candidate.
func match(root *html.Node, selector string) []*html.Node {
	selector = strings.TrimSpace(selector)
	if name, ok := parseWeblaySelector(selector); ok {
		var out []*html.Node
		walk(root, func(n *html.Node) {
			if n.Type == html.ElementNode {
				if v, ok := getAttr(n, "data-weblay"); ok && v == name {
					out = append(out, n)
				}
			}
		})
		return out
	}

	parts := strings.Split(selector, " > ")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}
	last := parts[len(parts)-1]

	var out []*html.Node
	walk(root, func(n *html.Node) {
		if n.Type != html.ElementNode || !matchPart(n, last) {
			return
		}
		cur := n
		ok := true
		for i := len(parts) - 2; i >= 0; i-- {
			cur = parentElement(cur)
			if cur == nil || !matchPart(cur, parts[i]) {
				ok = false
				break
			}
		}
		if ok {
			out = append(out, n)
		}
	})
	return out
}

// parseWeblaySelector extracts NAME from `[data-weblay="NAME"]`, CSS-unescaping
// it to recover the literal attribute value.
func parseWeblaySelector(sel string) (string, bool) {
	const prefix = `[data-weblay="`
	const suffix = `"]`
	if !strings.HasPrefix(sel, prefix) || !strings.HasSuffix(sel, suffix) {
		return "", false
	}
	inner := sel[len(prefix) : len(sel)-len(suffix)]
	return cssUnescape(inner), true
}

func matchPart(n *html.Node, part string) bool {
	switch {
	case part == "body":
		return n.DataAtom == atom.Body || strings.EqualFold(n.Data, "body")
	case strings.HasPrefix(part, "#"):
		id, ok := getAttr(n, "id")
		return ok && id == cssUnescape(part[1:])
	default:
		tag := part
		if i := strings.Index(part, ":nth-of-type("); i >= 0 {
			tag = part[:i]
			rest := part[i+len(":nth-of-type("):]
			j := strings.IndexByte(rest, ')')
			if j < 0 {
				return false
			}
			nth, err := strconv.Atoi(strings.TrimSpace(rest[:j]))
			if err != nil {
				return false
			}
			if !strings.EqualFold(n.Data, tag) {
				return false
			}
			return nthOfType(n) == nth
		}
		return strings.EqualFold(n.Data, tag)
	}
}

// nthOfType returns the 1-based position of n among its parent's element
// children of the same tag, matching selector.ts's index computation
// (`sib.tagName === node.tagName`).
func nthOfType(n *html.Node) int {
	parent := parentElement(n)
	if parent == nil {
		return 1
	}
	count := 0
	for c := parent.FirstChild; c != nil; c = c.NextSibling {
		if c.Type != html.ElementNode {
			continue
		}
		if strings.EqualFold(c.Data, n.Data) {
			count++
		}
		if c == n {
			return count
		}
	}
	return count
}

func parentElement(n *html.Node) *html.Node {
	for p := n.Parent; p != nil; p = p.Parent {
		if p.Type == html.ElementNode {
			return p
		}
	}
	return nil
}

// --- small utilities --------------------------------------------------------

func walk(n *html.Node, fn func(*html.Node)) {
	fn(n)
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		walk(c, fn)
	}
}

func findFirst(n *html.Node, pred func(*html.Node) bool) *html.Node {
	if pred(n) {
		return n
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if found := findFirst(c, pred); found != nil {
			return found
		}
	}
	return nil
}

// cssUnescape reverses CSS identifier escaping (both `\c` literal escapes and
// `\HH ` hex escapes), recovering the literal string CSS.escape encoded.
func cssUnescape(s string) string {
	if !strings.Contains(s, `\`) {
		return s
	}
	var b strings.Builder
	for i := 0; i < len(s); {
		if s[i] != '\\' {
			b.WriteByte(s[i])
			i++
			continue
		}
		i++
		if i >= len(s) {
			break
		}
		j := i
		for j < len(s) && j < i+6 && isHex(s[j]) {
			j++
		}
		if j > i {
			if n, err := strconv.ParseInt(s[i:j], 16, 32); err == nil {
				b.WriteRune(rune(n))
			}
			i = j
			if i < len(s) && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n') {
				i++ // consume the single optional trailing whitespace
			}
			continue
		}
		b.WriteByte(s[i])
		i++
	}
	return b.String()
}

func isHex(c byte) bool {
	return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}

func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j-1] > s[j]; j-- {
			s[j-1], s[j] = s[j], s[j-1]
		}
	}
}
