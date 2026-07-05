package store

import "context"

// migrate applies the schema. Statements are idempotent (IF NOT EXISTS) so
// this is safe to run on every boot; versioned migrations can replace this
// once the schema starts changing between releases.
func (s *Store) migrate(ctx context.Context) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id            TEXT PRIMARY KEY,
			email         TEXT NOT NULL UNIQUE,
			name          TEXT NOT NULL DEFAULT '',
			password_hash TEXT NOT NULL,
			role          TEXT NOT NULL DEFAULT 'admin',
			created_at    TIMESTAMP NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			token_hash TEXT PRIMARY KEY,
			user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			expires_at TIMESTAMP NOT NULL,
			created_at TIMESTAMP NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS sites (
			id         TEXT PRIMARY KEY,
			site_key   TEXT NOT NULL UNIQUE,
			name       TEXT NOT NULL,
			created_by TEXT NOT NULL REFERENCES users(id),
			created_at TIMESTAMP NOT NULL
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
		`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`,
		`CREATE INDEX IF NOT EXISTS idx_edit_tokens_expires ON edit_tokens(expires_at)`,
		`CREATE INDEX IF NOT EXISTS idx_elements_page ON elements(page_id)`,
		`CREATE INDEX IF NOT EXISTS idx_revisions_page ON revisions(page_id)`,
	}
	for _, stmt := range stmts {
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return err
		}
	}
	return nil
}
