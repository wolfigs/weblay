// Package ssr applies a published Weblay manifest to a page's HTML on the
// server, so the edited content is present in the first byte the origin sends —
// visible to crawlers and social-preview bots that never run JavaScript.
//
// This is the server-side twin of connector/src/runtime.ts. It reproduces the
// runtime's applyManifest semantics exactly: same selector matching (the two
// shapes selectorFor emits), same "skip if the selector is ambiguous" rule,
// same html-wins-over-text precedence, the same attribute/style handling, and
// the same widest-first @media stylesheet. It routes all content through the
// shared internal/sanitize trust boundary, so neither side trusts the other.
package ssr

import (
	"bytes"
	"sort"
	"strconv"
	"strings"

	"github.com/wolfigs/weblay/internal/sanitize"
	"golang.org/x/net/html"
)

// mediaStyleID matches connector/src/runtime.ts MEDIA_STYLE_ID so a page that
// later loads the connector reuses the same <style> node instead of duplicating.
const mediaStyleID = "weblay-media"

// ElementContent is the editable payload for one element. JSON-compatible with
// store.ElementContent, redefined here so the rewrite core (and the standalone
// edge binary) need not depend on the storage layer and its database drivers.
type ElementContent struct {
	Text  *string                      `json:"text,omitempty"`
	HTML  *string                      `json:"html,omitempty"`
	Attrs map[string]string            `json:"attrs,omitempty"`
	Style map[string]string            `json:"style,omitempty"`
	Media map[string]map[string]string `json:"media,omitempty"`
}

// Manifest is the published payload: selector → content. JSON-compatible with
// store.Manifest.
type Manifest struct {
	Version  int                        `json:"version"`
	Elements map[string]*ElementContent `json:"elements"`
}

// Rewrite parses src as an HTML document, applies every override in m, and
// returns the re-serialized document. When m is nil or empty the input is
// returned unchanged (no parse cost). A parse error also returns the input
// unchanged: SSR must never turn a servable page into an error.
func Rewrite(src []byte, m *Manifest) ([]byte, error) {
	if m == nil || len(m.Elements) == 0 {
		return src, nil
	}
	doc, err := html.Parse(bytes.NewReader(src))
	if err != nil {
		return src, err
	}

	// Deterministic selector order so overlapping edits resolve identically on
	// every run (Go map iteration is randomized).
	selectors := make([]string, 0, len(m.Elements))
	for sel := range m.Elements {
		selectors = append(selectors, sel)
	}
	sort.Strings(selectors)

	for _, sel := range selectors {
		applyContent(doc, sel, m.Elements[sel])
	}
	injectResponsive(doc, m.Elements)

	var buf bytes.Buffer
	if err := html.Render(&buf, doc); err != nil {
		return src, err
	}
	return buf.Bytes(), nil
}

// applyContent mirrors runtime.ts applyContent for a single selector.
func applyContent(doc *html.Node, selector string, content *ElementContent) {
	if content == nil {
		return
	}
	els := match(doc, selector)
	// A selector matching zero or multiple elements is ambiguous — applying it
	// would edit the wrong element(s), so skip. Identical to the runtime's
	// `if (els.length !== 1) return`.
	if len(els) != 1 {
		return
	}
	el := els[0]

	// html wins over text; both replace the element's contents.
	if content.HTML != nil {
		setInnerHTML(el, sanitize.HTML(*content.HTML))
	} else if content.Text != nil {
		setTextContent(el, *content.Text)
	}

	for key, val := range sanitize.Attrs(content.Attrs) {
		if val == "" {
			removeAttr(el, key) // empty = remove (e.g. clearing srcset)
		} else {
			setAttr(el, key, val)
		}
	}

	// Base styles apply on all screens; set them inline, mirroring the runtime's
	// el.style.setProperty. Empty values carry no effect for the base tier (the
	// runtime's isSafeCSSValue rejects them), so they are skipped here too.
	if base := sanitize.Style(content.Style); len(base) > 0 {
		mergeInlineStyle(el, base)
	}
}

// injectResponsive builds one widest-first @media stylesheet from every
// element's breakpoint buckets and injects it into <head>, matching runtime.ts
// applyResponsive. Base styles are already inline (all screens), so these rules
// carry !important to beat the inline base.
func injectResponsive(doc *html.Node, elements map[string]*ElementContent) {
	thresholds := map[int]bool{}
	for _, content := range elements {
		for key := range content.Media {
			if t, ok := parseThreshold(key); ok {
				thresholds[t] = true
			}
		}
	}
	if len(thresholds) == 0 {
		return
	}
	order := make([]int, 0, len(thresholds))
	for t := range thresholds {
		order = append(order, t)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(order))) // widest first

	// Deterministic selector order within each block.
	selectors := make([]string, 0, len(elements))
	for sel := range elements {
		selectors = append(selectors, sel)
	}
	sort.Strings(selectors)

	var css strings.Builder
	for _, t := range order {
		var block strings.Builder
		for _, sel := range selectors {
			styles := elements[sel].Media[strconv.Itoa(t)]
			if styles == nil {
				continue
			}
			if decls := responsiveDecls(styles); decls != "" {
				block.WriteString(sel)
				block.WriteString("{")
				block.WriteString(decls)
				block.WriteString("}")
			}
		}
		if block.Len() > 0 {
			css.WriteString("@media (max-width:")
			css.WriteString(strconv.Itoa(t))
			css.WriteString("px){")
			css.WriteString(block.String())
			css.WriteString("}")
		}
	}
	if css.Len() == 0 {
		return
	}
	setStyleSheet(doc, mediaStyleID, css.String())
}

// responsiveDecls mirrors runtime.ts responsiveDecls: safe props become
// `prop:value!important`; an empty value clears the base at this breakpoint.
func responsiveDecls(styles map[string]string) string {
	safe := sanitize.Style(styles) // drops unsafe props/values, keeps "" clears
	keys := make([]string, 0, len(safe))
	for k := range safe {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var out []string
	for _, prop := range keys {
		if safe[prop] == "" {
			out = append(out, prop+":unset!important")
		} else {
			out = append(out, prop+":"+safe[prop]+"!important")
		}
	}
	return strings.Join(out, ";")
}

// parseThreshold mirrors connector/src/breakpoints.ts: a media bucket key is a
// positive integer px threshold, 1..10000.
func parseThreshold(key string) (int, bool) {
	if key == "" {
		return 0, false
	}
	for _, c := range key {
		if c < '0' || c > '9' {
			return 0, false
		}
	}
	n, err := strconv.Atoi(key)
	if err != nil || n <= 0 || n > 10000 {
		return 0, false
	}
	return n, true
}
