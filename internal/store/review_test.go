package store

import (
	"context"
	"testing"
	"time"
)

func TestReviewWorkflow(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	owner := testUser(t, s)
	site := testSite(t, s, owner)
	page, err := s.EnsurePage(ctx, site.ID, "/about")
	if err != nil {
		t.Fatal(err)
	}

	// No pending reviews initially.
	if pr, _ := s.PendingReviews(ctx, site.ID); len(pr) != 0 {
		t.Fatalf("expected 0 pending reviews, got %d", len(pr))
	}

	// Submit for review, then it appears.
	if err := s.SubmitReview(ctx, page.ID, owner.ID); err != nil {
		t.Fatal(err)
	}
	pr, err := s.PendingReviews(ctx, site.ID)
	if err != nil || len(pr) != 1 || pr[0].Path != "/about" || pr[0].RequestedBy != owner.ID {
		t.Fatalf("pending review wrong: %+v (%v)", pr, err)
	}

	// Clearing removes it.
	if err := s.ClearReview(ctx, page.ID); err != nil {
		t.Fatal(err)
	}
	if pr, _ := s.PendingReviews(ctx, site.ID); len(pr) != 0 {
		t.Fatalf("expected 0 after clear, got %d", len(pr))
	}

	// Owner's membership role resolves (site creator is the owner).
	role, err := s.MemberRole(ctx, site.ID, owner.ID)
	if err != nil || role != "owner" {
		t.Fatalf("MemberRole = %q (%v), want owner", role, err)
	}
}

func TestPreviewLinkAndDraftManifest(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	owner := testUser(t, s)
	site := testSite(t, s, owner)
	page, _ := s.EnsurePage(ctx, site.ID, "/")

	// A draft exists but is unpublished.
	if err := s.UpsertDraft(ctx, page.ID, `[data-weblay="hero"]`, &ElementContent{Text: str("Draft heading")}, owner.ID); err != nil {
		t.Fatal(err)
	}
	m, err := s.DraftManifest(ctx, page.ID)
	if err != nil || m.Elements[`[data-weblay="hero"]`] == nil || *m.Elements[`[data-weblay="hero"]`].Text != "Draft heading" {
		t.Fatalf("draft manifest wrong: %+v (%v)", m, err)
	}

	// Preview token round-trips to (site, path); an unknown token fails.
	token, hash := NewToken()
	if err := s.CreatePreviewToken(ctx, hash, site.ID, "/", owner.ID, time.Now().UTC().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	gotSite, gotPath, err := s.PreviewToken(ctx, HashToken(token))
	if err != nil || gotSite != site.ID || gotPath != "/" {
		t.Fatalf("PreviewToken = %s,%s (%v)", gotSite, gotPath, err)
	}
	if _, _, err := s.PreviewToken(ctx, HashToken("nope")); err == nil {
		t.Fatal("invalid preview token should fail")
	}
}
