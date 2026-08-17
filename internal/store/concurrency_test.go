package store

import (
	"context"
	"errors"
	"testing"
)

// TestOptimisticConcurrency covers the concurrent-edit detection that replaces
// silent last-write-wins.
func TestOptimisticConcurrency(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	owner := testUser(t, s)
	site := testSite(t, s, owner)
	page, err := s.EnsurePage(ctx, site.ID, "/")
	if err != nil {
		t.Fatal(err)
	}
	sel := `[data-weblay="hero"]`

	// First write (base rev 0) creates the element at rev 1.
	rev, err := s.UpsertDraftChecked(ctx, page.ID, sel, &ElementContent{Text: str("v1")}, owner.ID, 0)
	if err != nil {
		t.Fatalf("first write: %v", err)
	}
	if rev != 1 {
		t.Fatalf("first rev = %d, want 1", rev)
	}

	// A second create at base 0 must conflict (element now exists).
	if _, err := s.UpsertDraftChecked(ctx, page.ID, sel, &ElementContent{Text: str("dupe")}, owner.ID, 0); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate create err = %v, want ErrConflict", err)
	}

	// Editor A saves on top of rev 1 → rev 2.
	rev2, err := s.UpsertDraftChecked(ctx, page.ID, sel, &ElementContent{Text: str("A")}, owner.ID, 1)
	if err != nil {
		t.Fatalf("editor A: %v", err)
	}
	if rev2 != 2 {
		t.Fatalf("rev after A = %d, want 2", rev2)
	}

	// Editor B still holds rev 1 → their save conflicts (no silent clobber).
	if _, err := s.UpsertDraftChecked(ctx, page.ID, sel, &ElementContent{Text: str("B")}, owner.ID, 1); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale editor B err = %v, want ErrConflict", err)
	}

	// The stored content is still A's — B did not overwrite it.
	elems, err := s.ElementsForPage(ctx, page.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(elems) != 1 || elems[0].Draft == nil || *elems[0].Draft.Text != "A" || elems[0].Rev != 2 {
		t.Fatalf("stored = %+v, want A @ rev 2", elems[0])
	}

	// After reloading rev 2, B's save succeeds → rev 3.
	rev3, err := s.UpsertDraftChecked(ctx, page.ID, sel, &ElementContent{Text: str("B2")}, owner.ID, 2)
	if err != nil || rev3 != 3 {
		t.Fatalf("rebased save rev = %d err = %v, want 3 nil", rev3, err)
	}

	// Unconditional UpsertDraft still works and keeps rev monotonic.
	if err := s.UpsertDraft(ctx, page.ID, sel, &ElementContent{Text: str("force")}, owner.ID); err != nil {
		t.Fatal(err)
	}
	elems, _ = s.ElementsForPage(ctx, page.ID)
	if elems[0].Rev != 4 {
		t.Fatalf("rev after unconditional = %d, want 4", elems[0].Rev)
	}
}
