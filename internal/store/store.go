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

// Store wraps the database handle and knows which dialect it speaks.
type Store struct {
	db   *sql.DB
	kind string // "sqlite" or "postgres"
}

// Open connects to the configured database and applies migrations.
func Open(cfg *config.Config) (*Store, error) {
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

	s := &Store{db: db, kind: kind}
	if err := s.migrate(ctx); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return s, nil
}

// Kind reports the active database dialect.
func (s *Store) Kind() string { return s.kind }

// Close closes the underlying database.
func (s *Store) Close() error { return s.db.Close() }

// rebind converts ?-style placeholders to $N for Postgres. Queries in this
// package are written with ? and passed through here.
func (s *Store) rebind(query string) string {
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

func (s *Store) exec(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return s.db.ExecContext(ctx, s.rebind(query), args...)
}

func (s *Store) query(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return s.db.QueryContext(ctx, s.rebind(query), args...)
}

func (s *Store) queryRow(ctx context.Context, query string, args ...any) *sql.Row {
	return s.db.QueryRowContext(ctx, s.rebind(query), args...)
}
