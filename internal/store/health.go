package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

// Binding statuses (the response ladder's persisted states).
const (
	StatusHealthy     = "healthy"     // apply confidently
	StatusAtRisk      = "at_risk"     // apply, but flagged for review
	StatusBroken      = "broken"      // target likely missing/mis-resolved
	StatusQuarantined = "quarantined" // ambiguous (e.g. duplicate) — do not apply
)

// BindingHealth is the drift-health record for one override (one page+selector).
// It aggregates all three detection channels: bind-time risk, crawl re-anchor
// confidence, and runtime telemetry counters.
type BindingHealth struct {
	ID         string    `json:"id"`
	SiteID     string    `json:"siteId"`
	PageID     string    `json:"pageId"`
	Path       string    `json:"path"`
	Selector   string    `json:"selector"`
	Descriptor string    `json:"descriptor,omitempty"` // JSON descriptor blob
	Confidence int       `json:"confidence"`           // 0–100 (authoritative min)
	Status     string    `json:"status"`
	Category   string    `json:"category"` // ok|moved|content-conflict|replaced|removed|ambiguous
	Reasons    []string  `json:"reasons"`
	Hits       int       `json:"hits"`   // runtime "found"
	Misses     int       `json:"misses"` // runtime "missing"/"displaced"
	Dupes      int       `json:"dupes"`  // runtime "duplicate"
	Late       int       `json:"late"`   // runtime "late" (rendered after apply)
	LastSeen   time.Time `json:"lastSeen,omitempty"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// TelemetryResult is one reported override state from the visitor runtime.
type TelemetryResult struct {
	Selector string `json:"sel"`
	State    string `json:"state"` // found|missing|duplicate|late|displaced
}

// deriveStatus maps confidence + runtime counters to a status. Fail-safe: any
// duplicate observation quarantines (ambiguous → must not apply).
func deriveStatus(confidence, hits, misses, dupes int) string {
	switch {
	case dupes > 0:
		return StatusQuarantined
	case confidence < 40:
		return StatusBroken
	case misses > 0 && misses >= hits:
		return StatusBroken
	case confidence < 75 || misses > 0:
		return StatusAtRisk
	default:
		return StatusHealthy
	}
}

func reasonsJSON(reasons []string) string {
	if len(reasons) == 0 {
		return "[]"
	}
	b, _ := json.Marshal(reasons)
	return string(b)
}

func parseReasons(s string) []string {
	var r []string
	if s == "" {
		return nil
	}
	_ = json.Unmarshal([]byte(s), &r)
	return r
}

// UpsertBindingDescriptor records the identity descriptor + bind-time risk for
// an override (detection channel #1), preserving accumulated runtime counters.
func (s *sqlStore) UpsertBindingDescriptor(ctx context.Context, bh *BindingHealth) error {
	now := time.Now().UTC()
	// Bind-time risk is a PREDICTION of fragility, not observed drift — it must
	// never raise an alarm on its own (that was a false-positive factory). A
	// successful editor bind is also live proof the element exists right now, so
	// we (re)set the row to healthy and let the crawl + telemetry be the only
	// channels that can later flag a real problem. Risk reasons are still stored
	// for display; the editor surfaces them live via riskSummary().
	res, err := s.exec(ctx,
		`UPDATE binding_health SET path = ?, descriptor_json = ?, confidence = 100, status = ?, category = 'ok', reasons_json = ?, updated_at = ?
		 WHERE page_id = ? AND selector = ?`,
		bh.Path, bh.Descriptor, StatusHealthy, reasonsJSON(bh.Reasons), now, bh.PageID, bh.Selector)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return nil
	}
	_, err = s.exec(ctx,
		`INSERT INTO binding_health (id, site_id, page_id, path, selector, descriptor_json, confidence, status, category, reasons_json, hits, misses, dupes, late, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, 100, ?, 'ok', ?, 0, 0, 0, 0, ?)`,
		NewID(), bh.SiteID, bh.PageID, bh.Path, bh.Selector, bh.Descriptor, StatusHealthy, reasonsJSON(bh.Reasons), now)
	return err
}

// recomputeStatus re-derives status from the current counters + a base confidence.
func (s *sqlStore) recomputeStatus(ctx context.Context, pageID, selector string, baseConfidence int) error {
	var hits, misses, dupes int
	err := s.queryRow(ctx,
		`SELECT hits, misses, dupes FROM binding_health WHERE page_id = ? AND selector = ?`,
		pageID, selector).Scan(&hits, &misses, &dupes)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	_, err = s.exec(ctx, `UPDATE binding_health SET status = ? WHERE page_id = ? AND selector = ?`,
		deriveStatus(baseConfidence, hits, misses, dupes), pageID, selector)
	return err
}

// RecordTelemetry folds runtime observations into the health counters and
// re-derives status (detection channel #3).
func (s *sqlStore) RecordTelemetry(ctx context.Context, siteID, pageID, path string, results []TelemetryResult) error {
	now := time.Now().UTC()
	for _, r := range results {
		var col string
		switch r.State {
		case "found":
			col = "hits"
		case "missing", "displaced":
			col = "misses"
		case "duplicate":
			col = "dupes"
		case "late":
			col = "late"
		default:
			continue
		}
		res, err := s.exec(ctx,
			`UPDATE binding_health SET `+col+` = `+col+` + 1, last_seen = ? WHERE page_id = ? AND selector = ?`,
			now, pageID, r.Selector)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			// Unknown selector (bound before this feature): create a minimal row.
			hits, misses, dupes, late := 0, 0, 0, 0
			switch col {
			case "hits":
				hits = 1
			case "misses":
				misses = 1
			case "dupes":
				dupes = 1
			case "late":
				late = 1
			}
			if _, err := s.exec(ctx,
				`INSERT INTO binding_health (id, site_id, page_id, path, selector, descriptor_json, confidence, status, category, reasons_json, hits, misses, dupes, late, last_seen, updated_at)
				 VALUES (?, ?, ?, ?, ?, '', 100, ?, 'ok', '[]', ?, ?, ?, ?, ?, ?)`,
				NewID(), siteID, pageID, path, r.Selector, deriveStatus(100, hits, misses, dupes), hits, misses, dupes, late, now, now); err != nil {
				return err
			}
			continue
		}
		if err := s.recomputeStatus(ctx, pageID, r.Selector, 100); err != nil {
			return err
		}
	}
	return nil
}

// BindingStatusUpdate is one re-anchor result destined for a binding_health row,
// used by UpdateBindingStatusBulk so the crawler can flush an entire page's
// results in a single database round-trip.
type BindingStatusUpdate struct {
	ID         string
	Confidence int
	Status     string
	Category   string
	Reasons    []string
}

// UpdateBindingStatus is used by the drift crawler to set re-anchor confidence,
// status, change category, and reasons.
func (s *sqlStore) UpdateBindingStatus(ctx context.Context, id string, confidence int, status, category string, reasons []string) error {
	_, err := s.exec(ctx,
		`UPDATE binding_health SET confidence = ?, status = ?, category = ?, reasons_json = ?, updated_at = ? WHERE id = ?`,
		confidence, status, category, reasonsJSON(reasons), time.Now().UTC(), id)
	return err
}

// UpdateBindingStatusBulk applies many status updates in one transaction, so a
// crawl of N bindings incurs a single commit rather than N separate writes.
func (s *sqlStore) UpdateBindingStatusBulk(ctx context.Context, updates []BindingStatusUpdate) error {
	if len(updates) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	stmt, err := tx.PrepareContext(ctx,
		`UPDATE binding_health SET confidence = ?, status = ?, category = ?, reasons_json = ?, updated_at = ? WHERE id = ?`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	now := time.Now().UTC()
	for _, u := range updates {
		if _, err := stmt.ExecContext(ctx, u.Confidence, u.Status, u.Category, reasonsJSON(u.Reasons), now, u.ID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// IssueCountsForSites returns the number of non-healthy bindings per site, for
// the dashboard's site cards + alerts. Only sites with issues appear in the map.
func (s *sqlStore) IssueCountsForSites(ctx context.Context, siteIDs []string) (map[string]int, error) {
	out := map[string]int{}
	if len(siteIDs) == 0 {
		return out, nil
	}
	ph, args := placeholders(siteIDs)
	rows, err := s.query(ctx,
		`SELECT site_id, COUNT(*) FROM binding_health WHERE status <> 'healthy' AND site_id IN (`+ph+`) GROUP BY site_id`,
		args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			return nil, err
		}
		out[id] = n
	}
	return out, rows.Err()
}

func placeholders(ids []string) (string, []any) {
	args := make([]any, len(ids))
	ph := make([]byte, 0, len(ids)*2)
	for i, id := range ids {
		if i > 0 {
			ph = append(ph, ',')
		}
		ph = append(ph, '?')
		args[i] = id
	}
	return string(ph), args
}

func (s *sqlStore) DeleteBindingHealth(ctx context.Context, pageID, selector string) error {
	_, err := s.exec(ctx, `DELETE FROM binding_health WHERE page_id = ? AND selector = ?`, pageID, selector)
	return err
}

// DeleteBindingHealthForPage wipes every health row for a page — including ones
// orphaned from telemetry or legacy seeds that no longer map to an override.
// Used by reset so "reset everything" truly clears the health board.
func (s *sqlStore) DeleteBindingHealthForPage(ctx context.Context, pageID string) error {
	_, err := s.exec(ctx, `DELETE FROM binding_health WHERE page_id = ?`, pageID)
	return err
}

func (s *sqlStore) BindingHealthForSite(ctx context.Context, siteID string) ([]*BindingHealth, error) {
	rows, err := s.query(ctx,
		`SELECT id, site_id, page_id, path, selector, descriptor_json, confidence, status, category, reasons_json, hits, misses, dupes, late, last_seen, updated_at
		 FROM binding_health WHERE site_id = ? ORDER BY confidence ASC, path`, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanBindings(rows)
}

func (s *sqlStore) BindingsForPage(ctx context.Context, pageID string) ([]*BindingHealth, error) {
	rows, err := s.query(ctx,
		`SELECT id, site_id, page_id, path, selector, descriptor_json, confidence, status, category, reasons_json, hits, misses, dupes, late, last_seen, updated_at
		 FROM binding_health WHERE page_id = ? ORDER BY selector`, pageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanBindings(rows)
}

func scanBindings(rows *sql.Rows) ([]*BindingHealth, error) {
	var out []*BindingHealth
	for rows.Next() {
		var (
			b          BindingHealth
			reasonsStr string
			lastSeen   sql.NullTime
		)
		if err := rows.Scan(&b.ID, &b.SiteID, &b.PageID, &b.Path, &b.Selector, &b.Descriptor,
			&b.Confidence, &b.Status, &b.Category, &reasonsStr, &b.Hits, &b.Misses, &b.Dupes, &b.Late, &lastSeen, &b.UpdatedAt); err != nil {
			return nil, err
		}
		b.Reasons = parseReasons(reasonsStr)
		if lastSeen.Valid {
			b.LastSeen = lastSeen.Time.UTC()
		}
		out = append(out, &b)
	}
	return out, rows.Err()
}
