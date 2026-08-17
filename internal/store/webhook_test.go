package store

import (
	"context"
	"strings"
	"testing"
)

// TestWebhookSecretLifecycle checks a secret is minted on create, loaded back by
// key/id, and rotated to a fresh value.
func TestWebhookSecretLifecycle(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()
	u := testUser(t, st)
	site := testSite(t, st, u)

	if !strings.HasPrefix(site.WebhookSecret, "whk_") {
		t.Fatalf("create should mint a webhook secret, got %q", site.WebhookSecret)
	}

	got, err := st.SiteByKey(ctx, site.SiteKey)
	if err != nil {
		t.Fatal(err)
	}
	if got.WebhookSecret != site.WebhookSecret {
		t.Fatalf("SiteByKey secret = %q, want %q", got.WebhookSecret, site.WebhookSecret)
	}

	rotated, err := st.RotateWebhookSecret(ctx, site.ID)
	if err != nil {
		t.Fatal(err)
	}
	if rotated == site.WebhookSecret || !strings.HasPrefix(rotated, "whk_") {
		t.Fatalf("rotate should mint a new secret, got %q (old %q)", rotated, site.WebhookSecret)
	}
	after, _ := st.SiteByID(ctx, site.ID)
	if after.WebhookSecret != rotated {
		t.Fatalf("after rotate SiteByID = %q, want %q", after.WebhookSecret, rotated)
	}
}
