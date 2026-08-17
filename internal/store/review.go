package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Review states for a page's publish request.
const (
	ReviewPending = "pending"
)

// PendingReview is a page awaiting publish approval.
type PendingReview struct {
	PageID      string    `json:"pageId"`
	Path        string    `json:"path"`
	RequestedBy string    `json:"requestedBy"`
	RequestedAt time.Time `json:"requestedAt"`
}

// MemberRole returns a user's role on a site ("owner"/"editor"), or ErrNotFound
// if they are not a member.
func (s *sqlStore) MemberRole(ctx context.Context, siteID, userID string) (string, error) {
	var role string
	err := s.queryRow(ctx, `SELECT role FROM site_members WHERE site_id = ? AND user_id = ?`, siteID, userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return role, err
}

// SubmitReview marks a page as awaiting publish approval.
func (s *sqlStore) SubmitReview(ctx context.Context, pageID, userID string) error {
	_, err := s.exec(ctx,
		`UPDATE pages SET review_state = ?, review_requested_by = ?, review_requested_at = ? WHERE id = ?`,
		ReviewPending, userID, time.Now().UTC(), pageID)
	return err
}

// ClearReview clears a page's review request (on approve or reject).
func (s *sqlStore) ClearReview(ctx context.Context, pageID string) error {
	_, err := s.exec(ctx,
		`UPDATE pages SET review_state = '', review_requested_by = '', review_requested_at = NULL WHERE id = ?`, pageID)
	return err
}

// PendingReviews lists a site's pages awaiting approval.
func (s *sqlStore) PendingReviews(ctx context.Context, siteID string) ([]*PendingReview, error) {
	rows, err := s.query(ctx,
		`SELECT id, path, review_requested_by, review_requested_at
		 FROM pages WHERE site_id = ? AND review_state = ? ORDER BY review_requested_at`,
		siteID, ReviewPending)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*PendingReview
	for rows.Next() {
		var pr PendingReview
		var at sql.NullTime
		if err := rows.Scan(&pr.PageID, &pr.Path, &pr.RequestedBy, &at); err != nil {
			return nil, err
		}
		if at.Valid {
			pr.RequestedAt = at.Time.UTC()
		}
		out = append(out, &pr)
	}
	return out, rows.Err()
}

// --- Preview links (share an unpublished draft) ---

// CreatePreviewToken stores a hashed, expiring preview token for a page path.
func (s *sqlStore) CreatePreviewToken(ctx context.Context, tokenHash, siteID, path, userID string, expires time.Time) error {
	_, err := s.exec(ctx,
		`INSERT INTO preview_tokens (token_hash, site_id, path, created_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		tokenHash, siteID, path, userID, expires, time.Now().UTC())
	return err
}

// PreviewToken resolves a live preview token to its (siteID, path).
func (s *sqlStore) PreviewToken(ctx context.Context, tokenHash string) (siteID, path string, err error) {
	err = s.queryRow(ctx,
		`SELECT site_id, path FROM preview_tokens WHERE token_hash = ? AND expires_at > ?`,
		tokenHash, time.Now().UTC()).Scan(&siteID, &path)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", ErrNotFound
	}
	return siteID, path, err
}

// DraftManifest builds a manifest from a page's current draft content — the
// unpublished state a preview link renders.
func (s *sqlStore) DraftManifest(ctx context.Context, pageID string) (*Manifest, error) {
	elems, err := s.ElementsForPage(ctx, pageID)
	if err != nil {
		return nil, err
	}
	m := &Manifest{Version: 0, Elements: map[string]*ElementContent{}}
	for _, e := range elems {
		if e.Draft != nil {
			m.Elements[e.Selector] = e.Draft
		}
	}
	return m, nil
}
