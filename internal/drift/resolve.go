// Package drift re-resolves override descriptors against freshly-fetched HTML,
// server-side and deterministically. It is the crawl detection channel (#2):
// the authoritative, off-visitor-thread check that turns silent drift into a
// confidence score + status.
//
// The hashing and path helpers mirror connector/src/descriptor.ts exactly, so a
// descriptor captured in the browser re-resolves identically here.
package drift

import (
	"encoding/json"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"

	"golang.org/x/net/html"
)

// Descriptor mirrors the client-side Descriptor.
type Descriptor struct {
	V      int    `json:"v"`
	Weblay string `json:"weblay,omitempty"`
	IDPath string `json:"idPath,omitempty"`
	Path   string `json:"path"`
	FP     struct {
		Tag      string `json:"tag"`
		TextHash string `json:"textHash"`
		AttrHash string `json:"attrHash"`
		Index    int    `json:"index"`
		Landmark string `json:"landmark"`
	} `json:"fp"`
}

// Resolution is the outcome of re-anchoring one descriptor. Category classifies
// what happened to the element so the dashboard can offer the right fix.
type Resolution struct {
	Confidence int
	Status     string // healthy|at_risk|broken|quarantined (mirrors store consts)
	Category   string // ok|moved|content-conflict|replaced|removed|ambiguous
	Reasons    []string
}

const (
	statusHealthy     = "healthy"
	statusAtRisk      = "at_risk"
	statusBroken      = "broken"
	statusQuarantined = "quarantined"
)

// Change categories (mirrored in the dashboard).
const (
	CatOK        = "ok"               // element unchanged
	CatMoved     = "moved"            // same element, new position
	CatConflict  = "content-conflict" // element there, but its source text changed
	CatReplaced  = "replaced"         // a different element now sits at that position
	CatRemoved   = "removed"          // element gone entirely
	CatAmbiguous = "ambiguous"        // multiple candidates (repeater/duplicate)
	CatUnknown   = "unknown"          // no descriptor to verify against — can't judge
)

// Resolve re-anchors a descriptor against a parsed document and classifies it.
func Resolve(doc *html.Node, raw string) Resolution {
	var d Descriptor
	if err := json.Unmarshal([]byte(raw), &d); err != nil || d.Path == "" {
		// No usable descriptor (legacy/seeded binding, or malformed). We have no
		// evidence of drift, so we must NOT invent an alarm — "can't verify" is
		// unknown, not broken. Runtime telemetry remains the signal for these.
		return Resolution{Confidence: 100, Status: statusHealthy, Category: CatUnknown, Reasons: []string{"unverified"}}
	}

	els := elements(doc)

	// 1. Exact author anchor (data-weblay) — strongest.
	if d.Weblay != "" {
		hits := filter(els, func(n *html.Node) bool { return attr(n, "data-weblay") == d.Weblay })
		switch len(hits) {
		case 1:
			return verify(els, hits[0], d, 100)
		case 0:
			return classifyMissing(els, d)
		default:
			return Resolution{Confidence: 30, Status: statusQuarantined, Category: CatAmbiguous, Reasons: []string{"duplicate-anchor"}}
		}
	}

	// 2. Structural path (recomputed per node, string-compared).
	pathHits := filter(els, func(n *html.Node) bool { return structuralPath(n) == d.Path })
	if len(pathHits) == 1 {
		return verify(els, pathHits[0], d, 95)
	}
	if len(pathHits) > 1 {
		return Resolution{Confidence: 35, Status: statusQuarantined, Category: CatAmbiguous, Reasons: []string{"ambiguous-path"}}
	}

	// 3. The path is gone — figure out whether it moved, was replaced, or removed.
	return classifyMissing(els, d)
}

// verify inspects a uniquely path/anchor-matched node.
//   - tag mismatch  → a different element is there now → replaced.
//   - text changed  → the source content under the override changed → conflict.
//   - otherwise     → unchanged → ok.
func verify(els []*html.Node, n *html.Node, d Descriptor, base int) Resolution {
	if !strings.EqualFold(n.Data, d.FP.Tag) {
		return Resolution{Confidence: 25, Status: statusQuarantined, Category: CatReplaced, Reasons: []string{"tag-changed"}}
	}
	if d.FP.TextHash != "" && textHash(n) != d.FP.TextHash {
		// The slot resolved but the text differs. Before assuming an in-place
		// content edit, check whether the element actually MOVED: if its original
		// content still resolves uniquely elsewhere, a same-tag sibling just shifted
		// into this slot (a reorder/swap), so this is a move, not a conflict.
		elsewhere := filter(els, func(x *html.Node) bool {
			return x != n && strings.EqualFold(x.Data, d.FP.Tag) && textHash(x) == d.FP.TextHash
		})
		if len(elsewhere) == 1 {
			return Resolution{Confidence: 80, Status: statusAtRisk, Category: CatMoved, Reasons: []string{"resolved-by-fingerprint", "slot-reused"}}
		}
		return Resolution{Confidence: max0(base - 20), Status: statusAtRisk, Category: CatConflict, Reasons: []string{"text-changed"}}
	}
	return Resolution{Confidence: base, Status: statusHealthy, Category: CatOK, Reasons: []string{}}
}

// classifyMissing runs when the anchor/path no longer resolves. It searches the
// fresh tree by fingerprint to distinguish moved / replaced / removed.
func classifyMissing(els []*html.Node, d Descriptor) Resolution {
	scope := els
	if d.FP.Landmark != "" && d.FP.Landmark != "body" {
		scope = landmarkScope(els, d.FP.Landmark)
	}
	tagHits := filter(scope, func(n *html.Node) bool { return strings.EqualFold(n.Data, d.FP.Tag) })

	// Same tag + same text found elsewhere → the element moved.
	textHits := filter(tagHits, func(n *html.Node) bool { return textHash(n) == d.FP.TextHash })
	if len(textHits) == 1 {
		return Resolution{Confidence: 82, Status: statusAtRisk, Category: CatMoved, Reasons: []string{"resolved-by-fingerprint"}}
	}
	if len(textHits) > 1 {
		return Resolution{Confidence: 40, Status: statusQuarantined, Category: CatAmbiguous, Reasons: []string{"repeater-ambiguous"}}
	}
	// Only the attribute signature matches (text differs). This is genuinely
	// ambiguous: it could be the same element moved AND edited, or the element was
	// removed and a look-alike (shared tag + reused class) simply remains. We must
	// NOT confidently "rebind" onto a possibly-wrong element — flag for review so
	// the developer resets or re-binds deliberately.
	attrHits := filter(tagHits, func(n *html.Node) bool { return attrSignatureHash(n) == d.FP.AttrHash })
	if len(attrHits) == 1 {
		return Resolution{Confidence: 40, Status: statusQuarantined, Category: CatAmbiguous, Reasons: []string{"attr-lookalike", "text-changed"}}
	}
	// Nothing resembling the element anywhere → it was removed.
	return Resolution{Confidence: 15, Status: statusBroken, Category: CatRemoved, Reasons: []string{"not-found"}}
}

// BuildDescriptorJSON constructs a descriptor for a node using the same signals
// the client captures, serialized as JSON. Exported for tooling and end-to-end
// tests that need to seed overrides with faithful descriptors. The returned
// "path" doubles as the override's structural selector key.
func BuildDescriptorJSON(n *html.Node) string {
	var d Descriptor
	d.V = 1
	d.Path = structuralPath(n)
	if w := attr(n, "data-weblay"); w != "" {
		d.Weblay = w
	}
	d.FP.Tag = strings.ToUpper(n.Data) // client uses el.tagName; verify() is case-insensitive
	d.FP.TextHash = textHash(n)
	d.FP.AttrHash = attrSignatureHash(n)
	d.FP.Landmark = nearestLandmarkSel(n)
	b, _ := json.Marshal(&d)
	return string(b)
}

// nearestLandmarkSel mirrors the client's nearestLandmark(): the selector of the
// closest semantic ancestor (or "body"). Used to scope fingerprint re-search.
func nearestLandmarkSel(el *html.Node) string {
	for node := parentElement(el); node != nil && !strings.EqualFold(node.Data, "body") && !strings.EqualFold(node.Data, "html"); node = parentElement(node) {
		if !isLandmarkNode(node) {
			continue
		}
		if id := attr(node, "id"); id != "" && !generatedID.MatchString(id) {
			return "#" + cssEscape(id)
		}
		if l := attr(node, "aria-label"); l != "" {
			return strings.ToLower(node.Data) + `[aria-label="` + cssEscape(l) + `"]`
		}
		if role := attr(node, "role"); role != "" {
			return strings.ToLower(node.Data) + `[role="` + cssEscape(role) + `"]`
		}
		return strings.ToLower(node.Data)
	}
	return "body"
}

func isLandmarkNode(n *html.Node) bool {
	switch strings.ToLower(n.Data) {
	case "main", "header", "footer", "nav", "article", "aside", "section":
		return true
	}
	return attr(n, "role") != "" || attr(n, "aria-label") != "" || attr(n, "id") != ""
}

func max0(n int) int {
	if n < 0 {
		return 0
	}
	return n
}

// --- tree helpers ---

func elements(root *html.Node) []*html.Node {
	var out []*html.Node
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			out = append(out, n)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(root)
	return out
}

func filter(els []*html.Node, ok func(*html.Node) bool) []*html.Node {
	var out []*html.Node
	for _, n := range els {
		if ok(n) {
			out = append(out, n)
		}
	}
	return out
}

func attr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

var safeID = regexp.MustCompile(`^[A-Za-z][\w-]*$`)
var generatedID = regexp.MustCompile(`(?i)^:r|(^|[-_])[a-f0-9]{5,}$|^(css|sc|jsx|mui|chakra)-`)

// structuralPath mirrors connector selectorFor() (incl. the data-weblay
// short-circuit and id anchoring).
func structuralPath(n *html.Node) string {
	if name := attr(n, "data-weblay"); name != "" {
		return `[data-weblay="` + cssEscape(name) + `"]`
	}
	var parts []string
	node := n
	for node != nil && node.Type == html.ElementNode && !strings.EqualFold(node.Data, "body") && !strings.EqualFold(node.Data, "html") {
		id := attr(node, "id")
		if id != "" && safeID.MatchString(id) && !generatedID.MatchString(id) {
			parts = append([]string{"#" + cssEscape(id)}, parts...)
			return strings.Join(parts, " > ")
		}
		idx := 1
		for s := node.PrevSibling; s != nil; s = s.PrevSibling {
			if s.Type == html.ElementNode && s.Data == node.Data {
				idx++
			}
		}
		parts = append([]string{strings.ToLower(node.Data) + ":nth-of-type(" + strconv.Itoa(idx) + ")"}, parts...)
		node = parentElement(node)
	}
	parts = append([]string{"body"}, parts...)
	return strings.Join(parts, " > ")
}

func parentElement(n *html.Node) *html.Node {
	for p := n.Parent; p != nil; p = p.Parent {
		if p.Type == html.ElementNode {
			return p
		}
	}
	return nil
}

// landmarkScope returns elements under any element matching a simple landmark
// selector (#id, tag, or tag[attr="v"]).
func landmarkScope(els []*html.Node, sel string) []*html.Node {
	var roots []*html.Node
	for _, n := range els {
		if matchesLandmark(n, sel) {
			roots = append(roots, n)
		}
	}
	if len(roots) == 0 {
		return els
	}
	var out []*html.Node
	for _, r := range roots {
		for _, n := range elements(r) {
			if n != r {
				out = append(out, n)
			}
		}
	}
	return out
}

var landmarkRe = regexp.MustCompile(`^([a-z]+)\[([a-z-]+)="(.*)"\]$`)

func matchesLandmark(n *html.Node, sel string) bool {
	if strings.HasPrefix(sel, "#") {
		return attr(n, "id") == sel[1:]
	}
	if m := landmarkRe.FindStringSubmatch(sel); m != nil {
		return strings.EqualFold(n.Data, m[1]) && attr(n, m[2]) == m[3]
	}
	return strings.EqualFold(n.Data, sel)
}

// --- fingerprint (must match descriptor.ts) ---

func normText(n *html.Node) string {
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
	collapsed := strings.Join(strings.Fields(b.String()), " ")
	return collapsed
}

// textHash mirrors hash(normText(el)) with the 512 UTF-16-unit cap.
func textHash(n *html.Node) string {
	units := utf16.Encode([]rune(normText(n)))
	if len(units) > 512 {
		units = units[:512]
	}
	return djb2(units)
}

var hashedClass = regexp.MustCompile(`(?i)^[a-z]+-[a-f0-9]{5,}$|^css-|^sc-`)

func attrSignatureHash(n *html.Node) string {
	keep := []string{"class", "role", "type", "name", "aria-label", "href", "alt"}
	var parts []string
	for _, k := range keep {
		v := attr(n, k)
		if v == "" {
			continue
		}
		if k == "class" {
			toks := strings.Fields(v)
			var kept []string
			for _, t := range toks {
				if !hashedClass.MatchString(t) {
					kept = append(kept, t)
				}
			}
			sort.Strings(kept)
			parts = append(parts, "class="+strings.Join(kept, "."))
			continue
		}
		parts = append(parts, k+"="+v)
	}
	return djb2(utf16.Encode([]rune(strings.Join(parts, "|"))))
}

// djb2 mirrors the client hash: h=5381; h=((h<<5)+h+unit)|0 over UTF-16 units;
// return (h>>>0).toString(36).
func djb2(units []uint16) string {
	var h int32 = 5381
	for _, u := range units {
		h = (h << 5) + h + int32(u)
	}
	return strconv.FormatUint(uint64(uint32(h)), 36)
}

func cssEscape(s string) string {
	// Mirrors the connector's fallback (CSS.escape unavailable server-side):
	// escape anything that isn't a word char or hyphen.
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteByte('\\')
			b.WriteRune(r)
		}
	}
	return b.String()
}
