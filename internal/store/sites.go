package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"time"
)

// Site is one connected website.
type Site struct {
	ID        string    `json:"id"`
	SiteKey   string    `json:"siteKey"`
	Name      string    `json:"name"`
	CreatedBy string    `json:"createdBy"`
	CreatedAt time.Time `json:"createdAt"`
	Origins   []string  `json:"origins"`
	// WebhookSecret authenticates the deploy webhook (POST /hooks/{key}/recrawl).
	// Never serialized to the dashboard list/get responses; exposed only through
	// the dedicated webhook endpoint.
	WebhookSecret string `json:"-"`
}

// NewSiteKey returns the public key embedded in the script tag.
func NewSiteKey() string {
	b := make([]byte, 10)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return "ilk_" + hex.EncodeToString(b)
}

// NewWebhookSecret returns a secret for the deploy-webhook recrawl trigger. It is
// low-sensitivity (it can only make the server re-crawl the site's own
// registered origins) so it is stored and displayed in plaintext for easy CI
// setup, unlike passwords/session tokens which are hashed.
func NewWebhookSecret() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return "whk_" + hex.EncodeToString(b)
}

// CreateSite inserts a site and makes the creator its owner.
func (s *sqlStore) CreateSite(ctx context.Context, site *Site) error {
	if site.WebhookSecret == "" {
		site.WebhookSecret = NewWebhookSecret()
	}
	if _, err := s.exec(ctx,
		`INSERT INTO sites (id, site_key, name, created_by, created_at, webhook_secret) VALUES (?, ?, ?, ?, ?, ?)`,
		site.ID, site.SiteKey, site.Name, site.CreatedBy, site.CreatedAt, site.WebhookSecret); err != nil {
		return err
	}
	_, err := s.exec(ctx,
		`INSERT INTO site_members (site_id, user_id, role) VALUES (?, ?, 'owner')`,
		site.ID, site.CreatedBy)
	return err
}

// SitesForUser lists sites the user is a member of.
func (s *sqlStore) SitesForUser(ctx context.Context, userID string) ([]*Site, error) {
	rows, err := s.query(ctx,
		`SELECT st.id, st.site_key, st.name, st.created_by, st.created_at
		 FROM sites st JOIN site_members m ON m.site_id = st.id
		 WHERE m.user_id = ? ORDER BY st.created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sites []*Site
	for rows.Next() {
		var st Site
		if err := rows.Scan(&st.ID, &st.SiteKey, &st.Name, &st.CreatedBy, &st.CreatedAt); err != nil {
			return nil, err
		}
		sites = append(sites, &st)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, st := range sites {
		if st.Origins, err = s.OriginsForSite(ctx, st.ID); err != nil {
			return nil, err
		}
	}
	return sites, nil
}

// AllSiteIDs lists every site id (used by the background drift crawler).
func (s *sqlStore) AllSiteIDs(ctx context.Context) ([]string, error) {
	rows, err := s.query(ctx, `SELECT id FROM sites`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// SiteByID fetches a site with its origins.
func (s *sqlStore) SiteByID(ctx context.Context, id string) (*Site, error) {
	return s.scanSite(ctx, s.queryRow(ctx,
		`SELECT id, site_key, name, created_by, created_at, webhook_secret FROM sites WHERE id = ?`, id))
}

// SiteByKey fetches a site by its public script-tag key.
func (s *sqlStore) SiteByKey(ctx context.Context, key string) (*Site, error) {
	return s.scanSite(ctx, s.queryRow(ctx,
		`SELECT id, site_key, name, created_by, created_at, webhook_secret FROM sites WHERE site_key = ?`, key))
}

func (s *sqlStore) scanSite(ctx context.Context, row *sql.Row) (*Site, error) {
	var st Site
	var secret sql.NullString
	err := row.Scan(&st.ID, &st.SiteKey, &st.Name, &st.CreatedBy, &st.CreatedAt, &secret)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	st.WebhookSecret = secret.String
	if st.Origins, err = s.OriginsForSite(ctx, st.ID); err != nil {
		return nil, err
	}
	return &st, nil
}

// RotateWebhookSecret assigns a fresh deploy-webhook secret and returns it. Also
// used to lazily backfill sites created before the webhook feature existed.
func (s *sqlStore) RotateWebhookSecret(ctx context.Context, siteID string) (string, error) {
	secret := NewWebhookSecret()
	_, err := s.exec(ctx, `UPDATE sites SET webhook_secret = ? WHERE id = ?`, secret, siteID)
	return secret, err
}

// DeleteSite removes a site and everything under it (FK cascade).
func (s *sqlStore) DeleteSite(ctx context.Context, id string) error {
	_, err := s.exec(ctx, `DELETE FROM sites WHERE id = ?`, id)
	return err
}

// IsMember reports whether the user belongs to the site.
func (s *sqlStore) IsMember(ctx context.Context, siteID, userID string) (bool, error) {
	var n int
	err := s.queryRow(ctx,
		`SELECT COUNT(*) FROM site_members WHERE site_id = ? AND user_id = ?`, siteID, userID).Scan(&n)
	return n > 0, err
}

// AddMember adds a user to a site by email.
func (s *sqlStore) AddMember(ctx context.Context, siteID, userID, role string) error {
	_, err := s.exec(ctx,
		`INSERT INTO site_members (site_id, user_id, role) VALUES (?, ?, ?)`, siteID, userID, role)
	return err
}

// Member is a site membership row for the dashboard.
type Member struct {
	UserID string `json:"userId"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	Role   string `json:"role"`
}

// MembersForSite lists site members.
func (s *sqlStore) MembersForSite(ctx context.Context, siteID string) ([]*Member, error) {
	rows, err := s.query(ctx,
		`SELECT u.id, u.email, u.name, m.role
		 FROM site_members m JOIN users u ON u.id = m.user_id
		 WHERE m.site_id = ? ORDER BY u.email`, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []*Member
	for rows.Next() {
		var m Member
		if err := rows.Scan(&m.UserID, &m.Email, &m.Name, &m.Role); err != nil {
			return nil, err
		}
		members = append(members, &m)
	}
	return members, rows.Err()
}

// OriginsForSite lists allowed origins for a site.
func (s *sqlStore) OriginsForSite(ctx context.Context, siteID string) ([]string, error) {
	rows, err := s.query(ctx, `SELECT origin FROM site_origins WHERE site_id = ? ORDER BY origin`, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	origins := []string{}
	for rows.Next() {
		var o string
		if err := rows.Scan(&o); err != nil {
			return nil, err
		}
		origins = append(origins, o)
	}
	return origins, rows.Err()
}

// AddOrigin allows an origin (scheme://host[:port]) to use edit-mode APIs.
func (s *sqlStore) AddOrigin(ctx context.Context, siteID, origin string) error {
	_, err := s.exec(ctx,
		`INSERT INTO site_origins (site_id, origin) VALUES (?, ?)`, siteID, origin)
	return err
}

// RemoveOrigin disallows an origin.
func (s *sqlStore) RemoveOrigin(ctx context.Context, siteID, origin string) error {
	_, err := s.exec(ctx,
		`DELETE FROM site_origins WHERE site_id = ? AND origin = ?`, siteID, origin)
	return err
}
