package store

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// migration is one ordered, recorded schema change. Statements run in a single
// transaction; a migration is applied at most once (tracked in schema_migrations).
type migration struct {
	version int
	name    string
	stmts   []string
	// tolerateDupCol treats "duplicate column" ALTER errors as success, so DBs
	// that added the column under the old ad-hoc migrator still record the
	// version cleanly on upgrade.
	tolerateDupCol bool
}

// migrations is the ordered schema history. Append new versions; never edit or
// renumber an applied one.
var migrations = []migration{
	{
		version: 1,
		name:    "baseline",
		stmts: []string{
			`CREATE TABLE IF NOT EXISTS users (
				id            TEXT PRIMARY KEY,
				email         TEXT NOT NULL UNIQUE,
				name          TEXT NOT NULL DEFAULT '',
				password_hash TEXT NOT NULL,
				role          TEXT NOT NULL DEFAULT 'member',
				permissions_json TEXT NOT NULL DEFAULT '[]',
				created_at    TIMESTAMP NOT NULL
			)`,
			`CREATE TABLE IF NOT EXISTS sessions (
				token_hash TEXT PRIMARY KEY,
				user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				expires_at TIMESTAMP NOT NULL,
				created_at TIMESTAMP NOT NULL
			)`,
			`CREATE TABLE IF NOT EXISTS sites (
				id             TEXT PRIMARY KEY,
				site_key       TEXT NOT NULL UNIQUE,
				name           TEXT NOT NULL,
				created_by     TEXT NOT NULL REFERENCES users(id),
				created_at     TIMESTAMP NOT NULL,
				webhook_secret TEXT NOT NULL DEFAULT ''
			)`,
			`CREATE TABLE IF NOT EXISTS site_origins (
				site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
				origin  TEXT NOT NULL,
				PRIMARY KEY (site_id, origin)
			)`,
			`CREATE TABLE IF NOT EXISTS site_members (
				site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				role    TEXT NOT NULL DEFAULT 'editor',
				PRIMARY KEY (site_id, user_id)
			)`,
			`CREATE TABLE IF NOT EXISTS pages (
				id                TEXT PRIMARY KEY,
				site_id           TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
				path              TEXT NOT NULL,
				published_version INTEGER NOT NULL DEFAULT 0,
				created_at        TIMESTAMP NOT NULL,
				UNIQUE (site_id, path)
			)`,
			`CREATE TABLE IF NOT EXISTS elements (
				id             TEXT PRIMARY KEY,
				page_id        TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
				selector       TEXT NOT NULL,
				draft_json     TEXT NOT NULL DEFAULT '{}',
				published_json TEXT NOT NULL DEFAULT '{}',
				updated_by     TEXT NOT NULL DEFAULT '',
				updated_at     TIMESTAMP NOT NULL,
				rev            INTEGER NOT NULL DEFAULT 0,
				UNIQUE (page_id, selector)
			)`,
			`CREATE TABLE IF NOT EXISTS revisions (
				id            TEXT PRIMARY KEY,
				page_id       TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
				version       INTEGER NOT NULL,
				manifest_json TEXT NOT NULL,
				published_by  TEXT NOT NULL DEFAULT '',
				published_at  TIMESTAMP NOT NULL,
				UNIQUE (page_id, version)
			)`,
			`CREATE TABLE IF NOT EXISTS edit_tokens (
				token_hash TEXT PRIMARY KEY,
				user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				site_id    TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
				expires_at TIMESTAMP NOT NULL,
				created_at TIMESTAMP NOT NULL
			)`,
			`CREATE TABLE IF NOT EXISTS assets (
				id         TEXT PRIMARY KEY,
				site_id    TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
				file_name  TEXT NOT NULL,
				disk_path  TEXT NOT NULL,
				size_bytes INTEGER NOT NULL,
				created_by TEXT NOT NULL DEFAULT '',
				created_at TIMESTAMP NOT NULL
			)`,
			`CREATE TABLE IF NOT EXISTS binding_health (
				id              TEXT PRIMARY KEY,
				site_id         TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
				page_id         TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
				path            TEXT NOT NULL DEFAULT '',
				selector        TEXT NOT NULL,
				descriptor_json TEXT NOT NULL DEFAULT '',
				confidence      INTEGER NOT NULL DEFAULT 100,
				status          TEXT NOT NULL DEFAULT 'healthy',
				category        TEXT NOT NULL DEFAULT 'ok',
				reasons_json    TEXT NOT NULL DEFAULT '[]',
				hits            INTEGER NOT NULL DEFAULT 0,
				misses          INTEGER NOT NULL DEFAULT 0,
				dupes           INTEGER NOT NULL DEFAULT 0,
				late            INTEGER NOT NULL DEFAULT 0,
				last_seen       TIMESTAMP,
				updated_at      TIMESTAMP NOT NULL,
				UNIQUE (page_id, selector)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`,
			`CREATE INDEX IF NOT EXISTS idx_edit_tokens_expires ON edit_tokens(expires_at)`,
			`CREATE INDEX IF NOT EXISTS idx_elements_page ON elements(page_id)`,
			`CREATE INDEX IF NOT EXISTS idx_revisions_page ON revisions(page_id)`,
			`CREATE INDEX IF NOT EXISTS idx_binding_health_site ON binding_health(site_id)`,
			`CREATE INDEX IF NOT EXISTS idx_binding_health_page ON binding_health(page_id)`,
		},
	},
	{
		// Columns added by the old ad-hoc migrator; tolerate duplicates so DBs
		// upgraded from that path record this version without error.
		version:        2,
		name:           "additive_columns",
		tolerateDupCol: true,
		stmts: []string{
			`ALTER TABLE sites ADD COLUMN webhook_secret TEXT NOT NULL DEFAULT ''`,
			`ALTER TABLE elements ADD COLUMN rev INTEGER NOT NULL DEFAULT 0`,
			`ALTER TABLE users ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '[]'`,
		},
	},
	{
		version:        3,
		name:           "session_metadata_and_account_security",
		tolerateDupCol: true,
		stmts: []string{
			// Session metadata powers the "active sessions" revocation UI.
			`ALTER TABLE sessions ADD COLUMN user_agent TEXT NOT NULL DEFAULT ''`,
			`ALTER TABLE sessions ADD COLUMN ip TEXT NOT NULL DEFAULT ''`,
			`ALTER TABLE sessions ADD COLUMN last_seen TIMESTAMP`,
			// Account security: email verification + TOTP 2FA.
			`ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`,
			`ALTER TABLE users ADD COLUMN totp_secret TEXT NOT NULL DEFAULT ''`,
			`ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0`,
			`ALTER TABLE users ADD COLUMN recovery_codes_json TEXT NOT NULL DEFAULT '[]'`,
			// One-time email tokens: password reset + email verification.
			`CREATE TABLE IF NOT EXISTS email_tokens (
				token_hash TEXT PRIMARY KEY,
				user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				purpose    TEXT NOT NULL,
				expires_at TIMESTAMP NOT NULL,
				created_at TIMESTAMP NOT NULL
			)`,
			`CREATE INDEX IF NOT EXISTS idx_email_tokens_expires ON email_tokens(expires_at)`,
		},
	},
	{
		version:        4,
		name:           "approval_workflow_and_preview_links",
		tolerateDupCol: true,
		stmts: []string{
			// Publish approval: a page can have a pending review request.
			`ALTER TABLE pages ADD COLUMN review_state TEXT NOT NULL DEFAULT ''`,
			`ALTER TABLE pages ADD COLUMN review_requested_by TEXT NOT NULL DEFAULT ''`,
			`ALTER TABLE pages ADD COLUMN review_requested_at TIMESTAMP`,
			// Shareable preview links for unpublished drafts.
			`CREATE TABLE IF NOT EXISTS preview_tokens (
				token_hash TEXT PRIMARY KEY,
				site_id    TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
				path       TEXT NOT NULL,
				created_by TEXT NOT NULL DEFAULT '',
				expires_at TIMESTAMP NOT NULL,
				created_at TIMESTAMP NOT NULL
			)`,
			`CREATE INDEX IF NOT EXISTS idx_preview_tokens_expires ON preview_tokens(expires_at)`,
		},
	},
}

// migrate applies all pending migrations in order, recording each in
// schema_migrations so it runs at most once.
func (s *sqlStore) migrate(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx,
		`CREATE TABLE IF NOT EXISTS schema_migrations (
			version    INTEGER PRIMARY KEY,
			name       TEXT NOT NULL DEFAULT '',
			applied_at TIMESTAMP NOT NULL
		)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	applied, err := s.appliedMigrations(ctx)
	if err != nil {
		return err
	}

	for _, m := range migrations {
		if applied[m.version] {
			continue
		}
		if err := s.applyMigration(ctx, m); err != nil {
			return fmt.Errorf("migration %d (%s): %w", m.version, m.name, err)
		}
	}
	return nil
}

func (s *sqlStore) appliedMigrations(ctx context.Context) (map[int]bool, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	applied := map[int]bool{}
	for rows.Next() {
		var v int
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		applied[v] = true
	}
	return applied, rows.Err()
}

func (s *sqlStore) applyMigration(ctx context.Context, m migration) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, stmt := range m.stmts {
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			if m.tolerateDupCol && isDuplicateColumn(err) {
				continue // column already present from an earlier ad-hoc migration
			}
			return err
		}
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`,
		m.version, m.name, time.Now().UTC()); err != nil {
		return err
	}
	return tx.Commit()
}

// isDuplicateColumn reports whether an ALTER TABLE ADD COLUMN failed only because
// the column already exists (SQLite and Postgres phrasings).
func isDuplicateColumn(err error) bool {
	msg := err.Error()
	return strings.Contains(msg, "duplicate column") || strings.Contains(msg, "already exists")
}
