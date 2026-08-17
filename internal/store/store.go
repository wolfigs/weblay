// Package store is the persistence layer for Weblay. It speaks database/sql
// against SQLite (default, zero-config) or Postgres (via DSN).
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	_ "modernc.org/sqlite"

	"github.com/wolfigs/weblay/internal/config"
)

// ErrNotFound is returned when a requested row does not exist.
var ErrNotFound = errors.New("not found")

// Store is the persistence interface for Weblay. It is backed by SQL (SQLite or
// Postgres) or MongoDB, chosen at Open time by the configured DSN.
type Store interface {
	Kind() string
	Close() error

	// Users & auth
	CountUsers(ctx context.Context) (int, error)
	CreateUser(ctx context.Context, u *User) error
	UserByEmail(ctx context.Context, email string) (*User, error)
	UserByID(ctx context.Context, id string) (*User, error)
	ListUsers(ctx context.Context) ([]*User, error)
	UpdateUserRole(ctx context.Context, id, role string, perms []string) error
	DeleteUser(ctx context.Context, id string) error
	EnsureSuperAdmin(ctx context.Context, email string) (bool, error)
	CreateSession(ctx context.Context, tokenHash, userID, userAgent, ip string, expires time.Time) error
	UserBySession(ctx context.Context, tokenHash string) (*User, error)
	DeleteSession(ctx context.Context, tokenHash string) error
	SessionsForUser(ctx context.Context, userID string) ([]*Session, error)
	RevokeSession(ctx context.Context, userID, sessionID string) error
	RevokeOtherSessions(ctx context.Context, userID, keepSessionID string) error
	TouchSession(ctx context.Context, sessionID string) error

	// Account security: email tokens, credentials, TOTP.
	CreateEmailToken(ctx context.Context, tokenHash, userID, purpose string, expires time.Time) error
	ConsumeEmailToken(ctx context.Context, tokenHash, purpose string) (string, error)
	SetPassword(ctx context.Context, userID, passwordHash string) error
	SetEmailVerified(ctx context.Context, userID string, verified bool) error
	SetTOTP(ctx context.Context, userID, secret string, enabled bool, recoveryCodes []string) error
	CreateEditToken(ctx context.Context, tokenHash, userID, siteID string, expires time.Time) error
	EditGrantByToken(ctx context.Context, tokenHash string) (*EditGrant, error)
	PruneExpired(ctx context.Context) error

	// Sites, members, origins
	CreateSite(ctx context.Context, site *Site) error
	SitesForUser(ctx context.Context, userID string) ([]*Site, error)
	AllSiteIDs(ctx context.Context) ([]string, error)
	SiteByID(ctx context.Context, id string) (*Site, error)
	SiteByKey(ctx context.Context, key string) (*Site, error)
	DeleteSite(ctx context.Context, id string) error
	RotateWebhookSecret(ctx context.Context, siteID string) (string, error)
	IsMember(ctx context.Context, siteID, userID string) (bool, error)
	MemberRole(ctx context.Context, siteID, userID string) (string, error)
	AddMember(ctx context.Context, siteID, userID, role string) error
	MembersForSite(ctx context.Context, siteID string) ([]*Member, error)
	OriginsForSite(ctx context.Context, siteID string) ([]string, error)
	AddOrigin(ctx context.Context, siteID, origin string) error
	RemoveOrigin(ctx context.Context, siteID, origin string) error

	// Pages & elements
	EnsurePage(ctx context.Context, siteID, path string) (*Page, error)
	PageByPath(ctx context.Context, siteID, path string) (*Page, error)
	PageByID(ctx context.Context, id string) (*Page, error)
	PagesForSite(ctx context.Context, siteID string) ([]*Page, error)
	UpsertDraft(ctx context.Context, pageID, selector string, content *ElementContent, updatedBy string) error
	UpsertDraftChecked(ctx context.Context, pageID, selector string, content *ElementContent, updatedBy string, baseRev int) (int, error)
	DeleteElement(ctx context.Context, pageID, selector string) error
	ElementsForPage(ctx context.Context, pageID string) ([]*Element, error)

	// Revisions & publishing
	PublishPage(ctx context.Context, pageID, publishedBy string) (*Revision, error)
	DiscardDrafts(ctx context.Context, pageID string) error
	PublishedManifest(ctx context.Context, pageID string) (*Manifest, error)
	DraftManifest(ctx context.Context, pageID string) (*Manifest, error)

	// Approval workflow + preview links
	SubmitReview(ctx context.Context, pageID, userID string) error
	ClearReview(ctx context.Context, pageID string) error
	PendingReviews(ctx context.Context, siteID string) ([]*PendingReview, error)
	CreatePreviewToken(ctx context.Context, tokenHash, siteID, path, userID string, expires time.Time) error
	PreviewToken(ctx context.Context, tokenHash string) (siteID, path string, err error)
	RevisionsForPage(ctx context.Context, pageID string) ([]*Revision, error)
	RevisionByID(ctx context.Context, id string) (*Revision, error)
	RestoreRevision(ctx context.Context, revisionID, userID string) (*Revision, error)
	RestoreRevisionToDraft(ctx context.Context, revisionID, userID string) (*Revision, error)

	// Assets
	CreateAsset(ctx context.Context, a *Asset) error
	AssetByID(ctx context.Context, id string) (*Asset, error)
	TotalAssetBytesForSite(ctx context.Context, siteID string) (int64, error)

	// Drift / binding health
	UpsertBindingDescriptor(ctx context.Context, bh *BindingHealth) error
	RecordTelemetry(ctx context.Context, siteID, pageID, path string, results []TelemetryResult) error
	UpdateBindingStatus(ctx context.Context, id string, confidence int, status, category string, reasons []string) error
	UpdateBindingStatusBulk(ctx context.Context, updates []BindingStatusUpdate) error
	DeleteBindingHealth(ctx context.Context, pageID, selector string) error
	DeleteBindingHealthForPage(ctx context.Context, pageID string) error
	BindingHealthForSite(ctx context.Context, siteID string) ([]*BindingHealth, error)
	BindingsForPage(ctx context.Context, pageID string) ([]*BindingHealth, error)
	IssueCountsForSites(ctx context.Context, siteIDs []string) (map[string]int, error)
}

// sqlStore is the SQL-backed implementation (SQLite or Postgres).
type sqlStore struct {
	db   *sql.DB
	kind string // "sqlite" or "postgres"
}

// Open connects to the configured database and applies migrations. A DSN
// beginning with mongodb selects the MongoDB backend; a non-mongo DSN selects
// Postgres; an empty DSN uses an embedded SQLite file in the data directory.
func Open(cfg *config.Config) (Store, error) {
	if isMongoDSN(cfg.DSN) {
		return openMongo(cfg)
	}
	return openSQL(cfg)
}

func openSQL(cfg *config.Config) (Store, error) {
	var (
		db   *sql.DB
		kind string
		err  error
	)
	if cfg.DSN != "" {
		kind = "postgres"
		db, err = sql.Open("pgx", cfg.DSN)
	} else {
		kind = "sqlite"
		path := filepath.Join(cfg.DataDir, "weblay.db")
		db, err = sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(ON)")
	}
	if err != nil {
		return nil, err
	}
	if kind == "sqlite" {
		// SQLite handles one writer; a single connection avoids SQLITE_BUSY
		// under concurrent writes while WAL keeps reads flowing.
		db.SetMaxOpenConns(1)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("ping %s: %w", kind, err)
	}

	s := &sqlStore{db: db, kind: kind}
	if err := s.migrate(ctx); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return s, nil
}

// isMongoDSN reports whether the DSN targets MongoDB.
func isMongoDSN(dsn string) bool {
	return strings.HasPrefix(dsn, "mongodb://") || strings.HasPrefix(dsn, "mongodb+srv://")
}

// Kind reports the active database dialect.
func (s *sqlStore) Kind() string { return s.kind }

// Close closes the underlying database.
func (s *sqlStore) Close() error { return s.db.Close() }

// rebind converts ?-style placeholders to $N for Postgres. Queries in this
// package are written with ? and passed through here.
func (s *sqlStore) rebind(query string) string {
	if s.kind != "postgres" {
		return query
	}
	var b strings.Builder
	n := 0
	for _, r := range query {
		if r == '?' {
			n++
			fmt.Fprintf(&b, "$%d", n)
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func (s *sqlStore) exec(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return s.db.ExecContext(ctx, s.rebind(query), args...)
}

func (s *sqlStore) query(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return s.db.QueryContext(ctx, s.rebind(query), args...)
}

func (s *sqlStore) queryRow(ctx context.Context, query string, args ...any) *sql.Row {
	return s.db.QueryRowContext(ctx, s.rebind(query), args...)
}
