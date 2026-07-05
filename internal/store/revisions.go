package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

// Manifest is the published payload the connector fetches: selector → content.
type Manifest struct {
	Version  int                        `json:"version"`
	Elements map[string]*ElementContent `json:"elements"`
}

// Revision is one published snapshot of a page.
type Revision struct {
	ID          string    `json:"id"`
	PageID      string    `json:"pageId"`
	Version     int       `json:"version"`
	Manifest    *Manifest `json:"manifest,omitempty"`
	PublishedBy string    `json:"publishedBy"`
	PublishedAt time.Time `json:"publishedAt"`
}

// PublishPage snapshots all drafts on a page into a new revision, promotes
// drafts to published, and bumps the page's published version.
func (s *Store) PublishPage(ctx context.Context, pageID, publishedBy string) (*Revision, error) {
	elems, err := s.ElementsForPage(ctx, pageID)
	if err != nil {
		return nil, err
	}
	page, err := s.PageByID(ctx, pageID)
	if err != nil {
		return nil, err
	}

	m := &Manifest{Version: page.PublishedVersion + 1, Elements: map[string]*ElementContent{}}
	for _, e := range elems {
		if e.Draft != nil {
			m.Elements[e.Selector] = e.Draft
		}
	}
	manifestJSON, err := json.Marshal(m)
	if err != nil {
		return nil, err
	}

	rev := &Revision{
		ID:          NewID(),
		PageID:      pageID,
		Version:     m.Version,
		Manifest:    m,
		PublishedBy: publishedBy,
		PublishedAt: time.Now().UTC(),
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, s.rebind(
		`INSERT INTO revisions (id, page_id, version, manifest_json, published_by, published_at) VALUES (?, ?, ?, ?, ?, ?)`),
		rev.ID, rev.PageID, rev.Version, string(manifestJSON), rev.PublishedBy, rev.PublishedAt); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, s.rebind(
		`UPDATE elements SET published_json = draft_json WHERE page_id = ?`), pageID); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, s.rebind(
		`UPDATE pages SET published_version = ? WHERE id = ?`), rev.Version, pageID); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return rev, nil
}

// PublishedManifest returns the latest published manifest for a page, or an
// empty manifest when nothing has been published.
func (s *Store) PublishedManifest(ctx context.Context, pageID string) (*Manifest, error) {
	var manifestJSON string
	err := s.queryRow(ctx,
		`SELECT r.manifest_json FROM revisions r JOIN pages p ON p.id = r.page_id
		 WHERE r.page_id = ? AND r.version = p.published_version`, pageID).Scan(&manifestJSON)
	if errors.Is(err, sql.ErrNoRows) {
		return &Manifest{Version: 0, Elements: map[string]*ElementContent{}}, nil
	}
	if err != nil {
		return nil, err
	}
	var m Manifest
	if err := json.Unmarshal([]byte(manifestJSON), &m); err != nil {
		return nil, err
	}
	return &m, nil
}

// RevisionsForPage lists revisions newest-first, without manifests.
func (s *Store) RevisionsForPage(ctx context.Context, pageID string) ([]*Revision, error) {
	rows, err := s.query(ctx,
		`SELECT id, page_id, version, published_by, published_at
		 FROM revisions WHERE page_id = ? ORDER BY version DESC`, pageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var revs []*Revision
	for rows.Next() {
		var r Revision
		if err := rows.Scan(&r.ID, &r.PageID, &r.Version, &r.PublishedBy, &r.PublishedAt); err != nil {
			return nil, err
		}
		revs = append(revs, &r)
	}
	return revs, rows.Err()
}

// RevisionByID fetches a revision including its manifest.
func (s *Store) RevisionByID(ctx context.Context, id string) (*Revision, error) {
	var (
		r            Revision
		manifestJSON string
	)
	err := s.queryRow(ctx,
		`SELECT id, page_id, version, manifest_json, published_by, published_at FROM revisions WHERE id = ?`,
		id).Scan(&r.ID, &r.PageID, &r.Version, &manifestJSON, &r.PublishedBy, &r.PublishedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(manifestJSON), &r.Manifest); err != nil {
		return nil, err
	}
	return &r, nil
}

// RestoreRevision copies a past revision's content into drafts and publishes
// it as a new version — rollback without rewriting history.
func (s *Store) RestoreRevision(ctx context.Context, revisionID, userID string) (*Revision, error) {
	rev, err := s.RevisionByID(ctx, revisionID)
	if err != nil {
		return nil, err
	}
	for selector, content := range rev.Manifest.Elements {
		if err := s.UpsertDraft(ctx, rev.PageID, selector, content, userID); err != nil {
			return nil, err
		}
	}
	return s.PublishPage(ctx, rev.PageID, userID)
}
