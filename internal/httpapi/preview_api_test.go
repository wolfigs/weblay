package httpapi

import (
	"net/http"
	"testing"
)

func TestPreviewManifestGuards(t *testing.T) {
	h := newHarness(t)
	setupUser(t, h, "owner@wolfigs.dev")
	res, out := h.do("POST", "/api/v1/sites", map[string]string{"name": "S"})
	h.expect(res, 201, out)
	siteKey := out["siteKey"].(string)

	// Missing token → 401.
	res, _ = h.do("GET", "/p/"+siteKey+"/manifest.json?path=/", nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("no token = %d, want 401", res.StatusCode)
	}
	// Bogus token → 403.
	res, _ = h.do("GET", "/p/"+siteKey+"/manifest.json?path=/&token=deadbeef", nil)
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("bad token = %d, want 403", res.StatusCode)
	}
}
