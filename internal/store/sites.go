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
}

// NewSiteKey returns the public key embedded in the script tag.
func NewSiteKey() string {
	b := make([]byte, 10)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return "ilk_" + hex.EncodeToString(b)
}

// CreateSite inserts a site and makes the creator its owner.
func (s *Store) CreateSite(ctx context.Context, site *Site) error {
	if _, err := s.exec(ctx,
		`INSERT INTO sites (id, site_key, name, created_by, created_at) VALUES (?, ?, ?, ?, ?)`,
		site.ID, site.SiteKey, site.Name, site.CreatedBy, site.CreatedAt); err != nil {
		return err
	}
	_, err := s.exec(ctx,
		`INSERT INTO site_members (site_id, user_id, role) VALUES (?, ?, 'owner')`,
		site.ID, site.CreatedBy)
	return err
}

// SitesForUser lists sites the user is a member of.
func (s *Store) SitesForUser(ctx context.Context, userID string) ([]*Site, error) {
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

// SiteByID fetches a site with its origins.
func (s *Store) SiteByID(ctx context.Context, id string) (*Site, error) {
	return s.scanSite(ctx, s.queryRow(ctx,
		`SELECT id, site_key, name, created_by, created_at FROM sites WHERE id = ?`, id))
}

// SiteByKey fetches a site by its public script-tag key.
func (s *Store) SiteByKey(ctx context.Context, key string) (*Site, error) {
	return s.scanSite(ctx, s.queryRow(ctx,
		`SELECT id, site_key, name, created_by, created_at FROM sites WHERE site_key = ?`, key))
}

func (s *Store) scanSite(ctx context.Context, row *sql.Row) (*Site, error) {
	var st Site
	err := row.Scan(&st.ID, &st.SiteKey, &st.Name, &st.CreatedBy, &st.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if st.Origins, err = s.OriginsForSite(ctx, st.ID); err != nil {
		return nil, err
	}
	return &st, nil
}

// DeleteSite removes a site and everything under it (FK cascade).
func (s *Store) DeleteSite(ctx context.Context, id string) error {
	_, err := s.exec(ctx, `DELETE FROM sites WHERE id = ?`, id)
	return err
}

// IsMember reports whether the user belongs to the site.
func (s *Store) IsMember(ctx context.Context, siteID, userID string) (bool, error) {
	var n int
	err := s.queryRow(ctx,
		`SELECT COUNT(*) FROM site_members WHERE site_id = ? AND user_id = ?`, siteID, userID).Scan(&n)
	return n > 0, err
}

// AddMember adds a user to a site by email.
func (s *Store) AddMember(ctx context.Context, siteID, userID, role string) error {
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
func (s *Store) MembersForSite(ctx context.Context, siteID string) ([]*Member, error) {
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
func (s *Store) OriginsForSite(ctx context.Context, siteID string) ([]string, error) {
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
func (s *Store) AddOrigin(ctx context.Context, siteID, origin string) error {
	_, err := s.exec(ctx,
		`INSERT INTO site_origins (site_id, origin) VALUES (?, ?)`, siteID, origin)
	return err
}

// RemoveOrigin disallows an origin.
func (s *Store) RemoveOrigin(ctx context.Context, siteID, origin string) error {
	_, err := s.exec(ctx,
		`DELETE FROM site_origins WHERE site_id = ? AND origin = ?`, siteID, origin)
	return err
}
