package store

import (
	"context"
	"testing"
)

// Covers the draft lifecycle: PagesForSite draft flags (the untyped-aggregate
// scan that previously 500'd) and DiscardDrafts reverting to published.
func TestDraftLifecycle(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	owner := testUser(t, s)
	site := testSite(t, s, owner)

	page, err := s.EnsurePage(ctx, site.ID, "/")
	if err != nil {
		t.Fatal(err)
	}

	// A brand-new draft on a never-published element.
	if err := s.UpsertDraft(ctx, page.ID, "h1", &ElementContent{Text: str("hello")}, owner.ID); err != nil {
		t.Fatal(err)
	}

	pages, err := s.PagesForSite(ctx, site.ID)
	if err != nil {
		t.Fatalf("PagesForSite: %v", err)
	}
	if len(pages) != 1 || !pages[0].HasDraft || pages[0].DraftUpdatedAt == nil {
		t.Fatalf("want 1 page with draft + timestamp, got %+v", pages[0])
	}

	// Publish clears the draft flag.
	if _, err := s.PublishPage(ctx, page.ID, owner.ID); err != nil {
		t.Fatal(err)
	}
	pages, _ = s.PagesForSite(ctx, site.ID)
	if pages[0].HasDraft {
		t.Fatalf("HasDraft should be false after publish: %+v", pages[0])
	}

	// New draft over the published element, then discard reverts it.
	if err := s.UpsertDraft(ctx, page.ID, "h1", &ElementContent{Text: str("changed")}, owner.ID); err != nil {
		t.Fatal(err)
	}
	pages, _ = s.PagesForSite(ctx, site.ID)
	if !pages[0].HasDraft {
		t.Fatal("HasDraft should be true after new draft")
	}
	if err := s.DiscardDrafts(ctx, page.ID); err != nil {
		t.Fatalf("DiscardDrafts: %v", err)
	}
	pages, _ = s.PagesForSite(ctx, site.ID)
	if pages[0].HasDraft {
		t.Fatal("HasDraft should be false after discard")
	}
	// Published content must survive discard.
	m, err := s.PublishedManifest(ctx, page.ID)
	if err != nil || m.Elements["h1"] == nil || *m.Elements["h1"].Text != "hello" {
		t.Fatalf("published content lost after discard: %+v, %v", m, err)
	}

	// Discarding a never-published draft removes the element entirely.
	if err := s.UpsertDraft(ctx, page.ID, "p", &ElementContent{Text: str("temp")}, owner.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.DiscardDrafts(ctx, page.ID); err != nil {
		t.Fatal(err)
	}
	elems, _ := s.ElementsForPage(ctx, page.ID)
	for _, e := range elems {
		if e.Selector == "p" {
			t.Fatal("never-published element should be removed on discard")
		}
	}
}
