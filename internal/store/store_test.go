package store

import (
	"context"
	"testing"
	"time"

	"github.com/wolfigs/weblay/internal/config"
)

func testStore(t *testing.T) Store {
	t.Helper()
	cfg, err := config.Load(config.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	s, err := Open(cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func testUser(t *testing.T, s Store) *User {
	t.Helper()
	u := &User{ID: NewID(), Email: "owner@example.com", Name: "Owner", PasswordHash: "x", Role: "admin", CreatedAt: time.Now().UTC()}
	if err := s.CreateUser(context.Background(), u); err != nil {
		t.Fatal(err)
	}
	return u
}

func testSite(t *testing.T, s Store, owner *User) *Site {
	t.Helper()
	site := &Site{ID: NewID(), SiteKey: NewSiteKey(), Name: "Test", CreatedBy: owner.ID, CreatedAt: time.Now().UTC()}
	if err := s.CreateSite(context.Background(), site); err != nil {
		t.Fatal(err)
	}
	return site
}

func str(s string) *string { return &s }

func TestUserRoundTrip(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	n, err := s.CountUsers(ctx)
	if err != nil || n != 0 {
		t.Fatalf("CountUsers = %d, %v; want 0, nil", n, err)
	}

	u := testUser(t, s)
	got, err := s.UserByEmail(ctx, "OWNER@example.com") // case-insensitive
	if err != nil {
		t.Fatalf("UserByEmail: %v", err)
	}
	if got.ID != u.ID {
		t.Errorf("got user %s, want %s", got.ID, u.ID)
	}

	if _, err := s.UserByEmail(ctx, "nobody@example.com"); err != ErrNotFound {
		t.Errorf("missing user: got %v, want ErrNotFound", err)
	}
}

func TestSessionLifecycle(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := testUser(t, s)

	token, hash := NewToken()
	if err := s.CreateSession(ctx, hash, u.ID, "agent", "127.0.0.1", time.Now().UTC().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	got, err := s.UserBySession(ctx, HashToken(token))
	if err != nil || got.ID != u.ID {
		t.Fatalf("UserBySession: %v", err)
	}

	// Expired sessions do not resolve.
	token2, hash2 := NewToken()
	_ = s.CreateSession(ctx, hash2, u.ID, "agent", "127.0.0.1", time.Now().UTC().Add(-time.Minute))
	if _, err := s.UserBySession(ctx, HashToken(token2)); err != ErrNotFound {
		t.Errorf("expired session: got %v, want ErrNotFound", err)
	}

	if err := s.DeleteSession(ctx, HashToken(token)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UserBySession(ctx, HashToken(token)); err != ErrNotFound {
		t.Errorf("deleted session: got %v, want ErrNotFound", err)
	}
}

func TestSiteMembership(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := testUser(t, s)
	site := testSite(t, s, u)

	ok, err := s.IsMember(ctx, site.ID, u.ID)
	if err != nil || !ok {
		t.Fatalf("creator should be a member: %v", err)
	}

	byKey, err := s.SiteByKey(ctx, site.SiteKey)
	if err != nil || byKey.ID != site.ID {
		t.Fatalf("SiteByKey: %v", err)
	}

	if err := s.AddOrigin(ctx, site.ID, "https://example.com"); err != nil {
		t.Fatal(err)
	}
	got, _ := s.SiteByID(ctx, site.ID)
	if len(got.Origins) != 1 || got.Origins[0] != "https://example.com" {
		t.Errorf("origins = %v", got.Origins)
	}
}

func TestDraftPublishManifestFlow(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := testUser(t, s)
	site := testSite(t, s, u)

	page, err := s.EnsurePage(ctx, site.ID, "/about")
	if err != nil {
		t.Fatal(err)
	}
	// EnsurePage is idempotent.
	again, _ := s.EnsurePage(ctx, site.ID, "/about")
	if again.ID != page.ID {
		t.Fatal("EnsurePage created a duplicate")
	}

	// Unpublished page → empty manifest, version 0.
	m, err := s.PublishedManifest(ctx, page.ID)
	if err != nil || m.Version != 0 || len(m.Elements) != 0 {
		t.Fatalf("empty manifest: %+v, %v", m, err)
	}

	if err := s.UpsertDraft(ctx, page.ID, `[data-weblay="hero"]`, &ElementContent{Text: str("Hello")}, u.ID); err != nil {
		t.Fatal(err)
	}
	// Draft is not visible until published.
	m, _ = s.PublishedManifest(ctx, page.ID)
	if len(m.Elements) != 0 {
		t.Fatal("draft leaked into published manifest")
	}

	rev, err := s.PublishPage(ctx, page.ID, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if rev.Version != 1 {
		t.Errorf("version = %d, want 1", rev.Version)
	}
	m, _ = s.PublishedManifest(ctx, page.ID)
	if got := m.Elements[`[data-weblay="hero"]`]; got == nil || got.Text == nil || *got.Text != "Hello" {
		t.Fatalf("published manifest missing content: %+v", m)
	}

	// Second edit + publish bumps version.
	_ = s.UpsertDraft(ctx, page.ID, `[data-weblay="hero"]`, &ElementContent{Text: str("Updated")}, u.ID)
	rev2, _ := s.PublishPage(ctx, page.ID, u.ID)
	if rev2.Version != 2 {
		t.Errorf("second publish version = %d, want 2", rev2.Version)
	}

	// Restore v1 → content back to Hello, as a NEW version 3.
	restored, err := s.RestoreRevision(ctx, rev.ID, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Version != 3 {
		t.Errorf("restored version = %d, want 3", restored.Version)
	}
	m, _ = s.PublishedManifest(ctx, page.ID)
	if got := m.Elements[`[data-weblay="hero"]`]; got == nil || *got.Text != "Hello" {
		t.Fatalf("restore did not bring back v1 content: %+v", m)
	}
}

func TestEditTokens(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := testUser(t, s)
	site := testSite(t, s, u)

	token, hash := NewToken()
	if err := s.CreateEditToken(ctx, hash, u.ID, site.ID, time.Now().UTC().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	g, err := s.EditGrantByToken(ctx, HashToken(token))
	if err != nil || g.UserID != u.ID || g.SiteID != site.ID {
		t.Fatalf("EditGrantByToken: %+v, %v", g, err)
	}

	// Expired tokens are pruned.
	_, hash2 := NewToken()
	_ = s.CreateEditToken(ctx, hash2, u.ID, site.ID, time.Now().UTC().Add(-time.Minute))
	if err := s.PruneExpired(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := s.EditGrantByToken(ctx, hash2); err != ErrNotFound {
		t.Errorf("expired token: got %v, want ErrNotFound", err)
	}
}
