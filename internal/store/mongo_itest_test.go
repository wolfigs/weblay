package store

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/wolfigs/weblay/internal/config"
)

// TestMongoLifecycle runs the full store contract against a real MongoDB
// deployment. It is skipped unless WEBLAY_MONGO_TEST_DSN is set, and it uses a
// throwaway database that it drops at the end, so it never touches real data.
//
//	WEBLAY_MONGO_TEST_DSN="mongodb+srv://…" go test ./internal/store -run TestMongoLifecycle -v
func TestMongoLifecycle(t *testing.T) {
	dsn := os.Getenv("WEBLAY_MONGO_TEST_DSN")
	if dsn == "" {
		t.Skip("set WEBLAY_MONGO_TEST_DSN to run the MongoDB integration test")
	}
	ctx := context.Background()
	dbName := "weblay_itest_" + NewID()[:12]

	st, err := Open(&config.Config{DSN: dsn, DBName: dbName})
	if err != nil {
		t.Fatalf("open mongo: %v", err)
	}
	ms := st.(*mongoStore)
	t.Cleanup(func() {
		_ = ms.db.Drop(ctx)
		_ = st.Close()
	})

	if st.Kind() != "mongodb" {
		t.Fatalf("Kind = %q, want mongodb", st.Kind())
	}

	// First-run gate.
	if n, err := st.CountUsers(ctx); err != nil || n != 0 {
		t.Fatalf("CountUsers = %d, %v; want 0", n, err)
	}

	// Users + sessions + edit tokens.
	u := &User{ID: NewID(), Email: "Owner@Example.com", Name: "Owner", PasswordHash: "x", Role: "admin", CreatedAt: time.Now().UTC()}
	if err := st.CreateUser(ctx, u); err != nil {
		t.Fatal(err)
	}
	if got, err := st.UserByEmail(ctx, "owner@example.com"); err != nil || got.ID != u.ID {
		t.Fatalf("UserByEmail: %v / %+v", err, got)
	}
	if _, err := st.UserByEmail(ctx, "nobody@x.com"); err != ErrNotFound {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
	if err := st.CreateSession(ctx, "sess1", u.ID, "test-agent", "127.0.0.1", time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if got, err := st.UserBySession(ctx, "sess1"); err != nil || got.ID != u.ID {
		t.Fatalf("UserBySession: %v / %+v", err, got)
	}

	// Sites, members, origins.
	site := &Site{ID: NewID(), SiteKey: NewSiteKey(), Name: "Test", CreatedBy: u.ID, CreatedAt: time.Now().UTC()}
	if err := st.CreateSite(ctx, site); err != nil {
		t.Fatal(err)
	}
	if ok, err := st.IsMember(ctx, site.ID, u.ID); err != nil || !ok {
		t.Fatalf("owner should be a member: %v / %v", ok, err)
	}
	if sites, err := st.SitesForUser(ctx, u.ID); err != nil || len(sites) != 1 {
		t.Fatalf("SitesForUser: %v / %d", err, len(sites))
	}
	if err := st.AddOrigin(ctx, site.ID, "https://a.com"); err != nil {
		t.Fatal(err)
	}
	if err := st.AddOrigin(ctx, site.ID, "https://a.com"); err != nil { // idempotent
		t.Fatal(err)
	}
	if got, _ := st.SiteByKey(ctx, site.SiteKey); len(got.Origins) != 1 {
		t.Fatalf("origins = %v, want 1 (deduped)", got.Origins)
	}

	// Pages, elements, draft detection.
	page, err := st.EnsurePage(ctx, site.ID, "/")
	if err != nil {
		t.Fatal(err)
	}
	if same, _ := st.EnsurePage(ctx, site.ID, "/"); same.ID != page.ID {
		t.Fatal("EnsurePage should be idempotent")
	}
	if err := st.UpsertDraft(ctx, page.ID, "h1", &ElementContent{Text: str("hello")}, u.ID); err != nil {
		t.Fatal(err)
	}
	pages, err := st.PagesForSite(ctx, site.ID)
	if err != nil || len(pages) != 1 || !pages[0].HasDraft || pages[0].DraftUpdatedAt == nil {
		t.Fatalf("PagesForSite draft flags wrong: %v / %+v", err, pages)
	}

	// Publish → clears draft, creates a revision.
	rev, err := st.PublishPage(ctx, page.ID, u.ID)
	if err != nil || rev.Version != 1 {
		t.Fatalf("PublishPage: %v / %+v", err, rev)
	}
	if pages, _ = st.PagesForSite(ctx, site.ID); pages[0].HasDraft {
		t.Fatal("HasDraft should be false after publish")
	}
	if m, err := st.PublishedManifest(ctx, page.ID); err != nil || m.Elements["h1"] == nil || *m.Elements["h1"].Text != "hello" {
		t.Fatalf("PublishedManifest: %v / %+v", err, m)
	}

	// New draft → discard reverts, published survives.
	if err := st.UpsertDraft(ctx, page.ID, "h1", &ElementContent{Text: str("changed")}, u.ID); err != nil {
		t.Fatal(err)
	}
	if err := st.DiscardDrafts(ctx, page.ID); err != nil {
		t.Fatal(err)
	}
	if pages, _ = st.PagesForSite(ctx, site.ID); pages[0].HasDraft {
		t.Fatal("HasDraft should be false after discard")
	}
	elems, _ := st.ElementsForPage(ctx, page.ID)
	if len(elems) != 1 || elems[0].Draft == nil || *elems[0].Draft.Text != "hello" {
		t.Fatalf("discard should revert draft to published: %+v", elems)
	}

	// Revisions + restore-as-draft.
	revs, err := st.RevisionsForPage(ctx, page.ID)
	if err != nil || len(revs) != 1 {
		t.Fatalf("RevisionsForPage: %v / %d", err, len(revs))
	}
	if _, err := st.RestoreRevisionToDraft(ctx, rev.ID, u.ID); err != nil {
		t.Fatal(err)
	}

	// Assets.
	a := &Asset{ID: NewID(), SiteID: site.ID, FileName: "x.png", DiskPath: "/tmp/x", SizeBytes: 10, CreatedBy: u.ID, CreatedAt: time.Now().UTC()}
	if err := st.CreateAsset(ctx, a); err != nil {
		t.Fatal(err)
	}
	if got, err := st.AssetByID(ctx, a.ID); err != nil || got.FileName != "x.png" {
		t.Fatalf("AssetByID: %v / %+v", err, got)
	}

	// Prune + cascade delete.
	if err := st.PruneExpired(ctx); err != nil {
		t.Fatal(err)
	}
	if err := st.DeleteSite(ctx, site.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := st.SiteByID(ctx, site.ID); err != ErrNotFound {
		t.Fatalf("site should be gone: %v", err)
	}
	if pages, _ := st.PagesForSite(ctx, site.ID); len(pages) != 0 {
		t.Fatalf("pages should be cascade-deleted, got %d", len(pages))
	}
}
