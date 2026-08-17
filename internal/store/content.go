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
	Style map[string]string `json:"style,omitempty"` // base styles — all screens
	// Media holds breakpoint-scoped styles: breakpoint id → prop → value.
	Media map[string]map[string]string `json:"media,omitempty"`
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
	// Rev is a per-element monotonic counter bumped on every draft write; it is
	// the optimistic-concurrency token that detects concurrent edits.
	Rev int `json:"rev"`
}

// ErrConflict is returned when an optimistic draft write loses to a concurrent
// edit (the caller's base revision no longer matches the stored one).
var ErrConflict = errors.New("edit conflict: content changed since it was loaded")

// Page is one path on a site.
type Page struct {
	ID               string     `json:"id"`
	SiteID           string     `json:"siteId"`
	Path             string     `json:"path"`
	PublishedVersion int        `json:"publishedVersion"`
	CreatedAt        time.Time  `json:"createdAt"`
	HasDraft         bool       `json:"hasDraft"`              // unpublished draft edits exist
	DraftUpdatedAt   *time.Time `json:"draftUpdatedAt,omitempty"` // last draft edit time
}

// EnsurePage returns the page for (siteID, path), creating it if missing.
func (s *sqlStore) EnsurePage(ctx context.Context, siteID, path string) (*Page, error) {
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
func (s *sqlStore) PageByPath(ctx context.Context, siteID, path string) (*Page, error) {
	return s.scanPage(s.queryRow(ctx,
		`SELECT id, site_id, path, published_version, created_at FROM pages WHERE site_id = ? AND path = ?`,
		siteID, path))
}

// PageByID fetches a page by id.
func (s *sqlStore) PageByID(ctx context.Context, id string) (*Page, error) {
	return s.scanPage(s.queryRow(ctx,
		`SELECT id, site_id, path, published_version, created_at FROM pages WHERE id = ?`, id))
}

func (s *sqlStore) scanPage(row *sql.Row) (*Page, error) {
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

// PagesForSite lists a site's pages, including whether each has unpublished
// draft edits (any element whose draft differs from its published content) and
// when those drafts were last touched.
func (s *sqlStore) PagesForSite(ctx context.Context, siteID string) ([]*Page, error) {
	rows, err := s.query(ctx,
		`SELECT p.id, p.site_id, p.path, p.published_version, p.created_at,
		        COALESCE(SUM(CASE WHEN e.draft_json IS NOT NULL
		                          AND e.draft_json <> e.published_json THEN 1 ELSE 0 END), 0) AS draft_count,
		        MAX(CASE WHEN e.draft_json IS NOT NULL
		                 AND e.draft_json <> e.published_json THEN e.updated_at END) AS draft_updated
		 FROM pages p
		 LEFT JOIN elements e ON e.page_id = p.id
		 WHERE p.site_id = ?
		 GROUP BY p.id, p.site_id, p.path, p.published_version, p.created_at
		 ORDER BY p.path`,
		siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pages []*Page
	for rows.Next() {
		var (
			p          Page
			draftCount int
			// The MAX(CASE…) aggregate has no column type affinity, so SQLite
			// hands it back as a string while Postgres returns a time.Time.
			// Scan into any and normalize both, rather than sql.NullTime (which
			// only accepts time.Time and would reject the SQLite string).
			draftUpdated any
		)
		if err := rows.Scan(&p.ID, &p.SiteID, &p.Path, &p.PublishedVersion, &p.CreatedAt, &draftCount, &draftUpdated); err != nil {
			return nil, err
		}
		p.HasDraft = draftCount > 0
		if t, ok := parseTimeValue(draftUpdated); ok {
			u := t.UTC()
			p.DraftUpdatedAt = &u
		}
		pages = append(pages, &p)
	}
	return pages, rows.Err()
}

// parseTimeValue normalizes a driver value that may hold a timestamp as either
// a time.Time (Postgres) or a string (SQLite, for untyped aggregate columns).
func parseTimeValue(v any) (time.Time, bool) {
	switch t := v.(type) {
	case nil:
		return time.Time{}, false
	case time.Time:
		return t, true
	case []byte:
		return parseTimeString(string(t))
	case string:
		return parseTimeString(t)
	}
	return time.Time{}, false
}

func parseTimeString(s string) (time.Time, bool) {
	if s == "" {
		return time.Time{}, false
	}
	// SQLite stores time.Time via its String() form; also accept RFC3339 forms.
	for _, layout := range []string{
		"2006-01-02 15:04:05.999999999 -0700 MST",
		"2006-01-02 15:04:05.999999999-07:00",
		time.RFC3339Nano,
		"2006-01-02 15:04:05",
	} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// UpsertDraft writes draft content for (pageID, selector), bumping rev. This is
// the unconditional path (seeds, restore-to-draft); interactive editor saves go
// through UpsertDraftChecked for concurrent-edit detection.
func (s *sqlStore) UpsertDraft(ctx context.Context, pageID, selector string, content *ElementContent, updatedBy string) error {
	_, err := s.upsertDraft(ctx, pageID, selector, content, updatedBy, nil)
	return err
}

// UpsertDraftChecked writes draft content only if the stored rev still equals
// baseRev, returning the new rev. On mismatch it returns ErrConflict, leaving
// the stored content untouched so the caller can reload and retry.
func (s *sqlStore) UpsertDraftChecked(ctx context.Context, pageID, selector string, content *ElementContent, updatedBy string, baseRev int) (int, error) {
	return s.upsertDraft(ctx, pageID, selector, content, updatedBy, &baseRev)
}

func (s *sqlStore) upsertDraft(ctx context.Context, pageID, selector string, content *ElementContent, updatedBy string, baseRev *int) (int, error) {
	draft, err := json.Marshal(content)
	if err != nil {
		return 0, err
	}
	now := time.Now().UTC()

	// Read the current rev (if the element exists) so we can enforce the base
	// and compute the next value.
	var curRev int
	existing := s.queryRow(ctx, `SELECT rev FROM elements WHERE page_id = ? AND selector = ?`, pageID, selector)
	switch err := existing.Scan(&curRev); {
	case errors.Is(err, sql.ErrNoRows):
		// New element. A checked write with a nonzero base expected a prior
		// version that no longer exists — that is a conflict.
		if baseRev != nil && *baseRev > 0 {
			return 0, ErrConflict
		}
		_, err := s.exec(ctx,
			`INSERT INTO elements (id, page_id, selector, draft_json, published_json, updated_by, updated_at, rev)
			 VALUES (?, ?, ?, ?, '{}', ?, ?, 1)`,
			NewID(), pageID, selector, string(draft), updatedBy, now)
		if err != nil {
			return 0, err
		}
		return 1, nil
	case err != nil:
		return 0, err
	}

	if baseRev != nil && *baseRev != curRev {
		return 0, ErrConflict
	}
	next := curRev + 1
	// Guard the UPDATE with the observed rev so a race between the read above and
	// this write is caught too (0 rows affected → conflict).
	res, err := s.exec(ctx,
		`UPDATE elements SET draft_json = ?, updated_by = ?, updated_at = ?, rev = ? WHERE page_id = ? AND selector = ? AND rev = ?`,
		string(draft), updatedBy, now, next, pageID, selector, curRev)
	if err != nil {
		return 0, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		if baseRev != nil {
			return 0, ErrConflict
		}
		// Unconditional caller lost a race; retry once with the fresh rev.
		return s.upsertDraft(ctx, pageID, selector, content, updatedBy, nil)
	}
	return next, nil
}

// DeleteElement removes an editable region entirely.
func (s *sqlStore) DeleteElement(ctx context.Context, pageID, selector string) error {
	_, err := s.exec(ctx, `DELETE FROM elements WHERE page_id = ? AND selector = ?`, pageID, selector)
	return err
}

// ElementsForPage lists all elements on a page.
func (s *sqlStore) ElementsForPage(ctx context.Context, pageID string) ([]*Element, error) {
	rows, err := s.query(ctx,
		`SELECT id, page_id, selector, draft_json, published_json, updated_by, updated_at, rev
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
		if err := rows.Scan(&e.ID, &e.PageID, &e.Selector, &draftJSON, &publishedJSON, &e.UpdatedBy, &e.UpdatedAt, &e.Rev); err != nil {
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
