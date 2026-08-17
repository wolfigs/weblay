package drift

import (
	"strings"
	"testing"

	"golang.org/x/net/html"
)

// BenchmarkResolve measures pure per-descriptor re-resolution compute (no I/O).
func BenchmarkResolve(b *testing.B) {
	// a moderately deep, realistic page
	var sb strings.Builder
	sb.WriteString(`<html><body><main>`)
	for i := 0; i < 40; i++ {
		sb.WriteString(`<section><div class="c"><h3 data-weblay="t">Item</h3><p>Body text here</p></div></section>`)
	}
	sb.WriteString(`</main></body></html>`)
	doc, _ := html.Parse(strings.NewReader(sb.String()))
	desc := `{"v":1,"weblay":"t","path":"[data-weblay=\"t\"]","fp":{"tag":"H3","textHash":"","attrHash":"","landmark":"section"}}`
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = Resolve(doc, desc)
	}
}
