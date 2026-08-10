package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

// ElementContent is the editable payload for one element.
type ElementContent struct {
	Text  *string           `json:"text,omitempty"`
	HTML  *string           `json:"html,omitempty"`
	Attrs map[string]string `json:"attrs,omitempty"`
	Style map[string]string `json:"style,omitempty"`
}

// Element is one editable region on a page, with draft and published state.
type Element struct {
	ID        string          `json:"id"`
	PageID    string          `json:"pageId"`
	Selector  string          `json:"selector"`
	Draft     *ElementContent `json:"draft"`
	Published *ElementContent `json:"published"`
	UpdatedBy string          `json:"updatedBy"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

// Page is one path on a site.
type Page struct {
	ID               string    `json:"id"`
	SiteID           string    `json:"siteId"`
	Path             string    `json:"path"`
	PublishedVersion int       `json:"publishedVersion"`
	CreatedAt        time.Time `json:"createdAt"`
}

// EnsurePage returns the page for (siteID, path), creating it if missing.
func (s *Store) EnsurePage(ctx context.Context, siteID, path string) (*Page, error) {
	p, err := s.PageByPath(ctx, siteID, path)
	if err == nil {
		return p, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return nil, err
	}
	p = &Page{ID: NewID(), SiteID: siteID, Path: path, CreatedAt: time.Now().UTC()}
	if _, err := s.exec(ctx,
		`INSERT INTO pages (id, site_id, path, published_version, created_at) VALUES (?, ?, ?, 0, ?)`,
		p.ID, p.SiteID, p.Path, p.CreatedAt); err != nil {
		return nil, err
	}
	return p, nil
}

// PageByPath fetches a page by site and path.
func (s *Store) PageByPath(ctx context.Context, siteID, path string) (*Page, error) {
	return s.scanPage(s.queryRow(ctx,
		`SELECT id, site_id, path, published_version, created_at FROM pages WHERE site_id = ? AND path = ?`,
		siteID, path))
}

// PageByID fetches a page by id.
func (s *Store) PageByID(ctx context.Context, id string) (*Page, error) {
	return s.scanPage(s.queryRow(ctx,
		`SELECT id, site_id, path, published_version, created_at FROM pages WHERE id = ?`, id))
}

func (s *Store) scanPage(row *sql.Row) (*Page, error) {
	var p Page
	err := row.Scan(&p.ID, &p.SiteID, &p.Path, &p.PublishedVersion, &p.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// PagesForSite lists a site's pages.
func (s *Store) PagesForSite(ctx context.Context, siteID string) ([]*Page, error) {
	rows, err := s.query(ctx,
		`SELECT id, site_id, path, published_version, created_at FROM pages WHERE site_id = ? ORDER BY path`,
		siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pages []*Page
	for rows.Next() {
		var p Page
		if err := rows.Scan(&p.ID, &p.SiteID, &p.Path, &p.PublishedVersion, &p.CreatedAt); err != nil {
			return nil, err
		}
		pages = append(pages, &p)
	}
	return pages, rows.Err()
}

// UpsertDraft writes draft content for (pageID, selector).
func (s *Store) UpsertDraft(ctx context.Context, pageID, selector string, content *ElementContent, updatedBy string) error {
	draft, err := json.Marshal(content)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	// Portable upsert: UPDATE first, INSERT if nothing matched. Fine under
	// SQLite's single-writer connection; Postgres racing inserts hit the
	// unique constraint and surface as an error, which callers can retry.
	res, err := s.exec(ctx,
		`UPDATE elements SET draft_json = ?, updated_by = ?, updated_at = ? WHERE page_id = ? AND selector = ?`,
		string(draft), updatedBy, now, pageID, selector)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return nil
	}
	_, err = s.exec(ctx,
		`INSERT INTO elements (id, page_id, selector, draft_json, published_json, updated_by, updated_at)
		 VALUES (?, ?, ?, ?, '{}', ?, ?)`,
		NewID(), pageID, selector, string(draft), updatedBy, now)
	return err
}

// DeleteElement removes an editable region entirely.
func (s *Store) DeleteElement(ctx context.Context, pageID, selector string) error {
	_, err := s.exec(ctx, `DELETE FROM elements WHERE page_id = ? AND selector = ?`, pageID, selector)
	return err
}

// ElementsForPage lists all elements on a page.
func (s *Store) ElementsForPage(ctx context.Context, pageID string) ([]*Element, error) {
	rows, err := s.query(ctx,
		`SELECT id, page_id, selector, draft_json, published_json, updated_by, updated_at
		 FROM elements WHERE page_id = ? ORDER BY selector`, pageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var elems []*Element
	for rows.Next() {
		var (
			e            Element
			draftJSON    string
			publishedJSON string
		)
		if err := rows.Scan(&e.ID, &e.PageID, &e.Selector, &draftJSON, &publishedJSON, &e.UpdatedBy, &e.UpdatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(draftJSON), &e.Draft); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(publishedJSON), &e.Published); err != nil {
			return nil, err
		}
		elems = append(elems, &e)
	}
	return elems, rows.Err()
}
