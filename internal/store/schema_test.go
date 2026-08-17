package store

import (
	"context"
	"testing"
)

// TestMigrationsRecordedAndIdempotent verifies every migration is applied and
// recorded, and that re-running migrate() is a no-op.
func TestMigrationsRecordedAndIdempotent(t *testing.T) {
	s := testStore(t).(*sqlStore)
	ctx := context.Background()

	applied, err := s.appliedMigrations(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range migrations {
		if !applied[m.version] {
			t.Errorf("migration %d (%s) not recorded", m.version, m.name)
		}
	}
	if len(applied) != len(migrations) {
		t.Fatalf("recorded %d migrations, want %d", len(applied), len(migrations))
	}

	// Re-running is safe and does not duplicate rows.
	if err := s.migrate(ctx); err != nil {
		t.Fatalf("re-run migrate: %v", err)
	}
	again, _ := s.appliedMigrations(ctx)
	if len(again) != len(migrations) {
		t.Fatalf("after re-run recorded %d, want %d", len(again), len(migrations))
	}

	// A column from a later migration exists (proves migration 3 ran).
	if _, err := s.db.ExecContext(ctx, `SELECT totp_enabled FROM users LIMIT 1`); err != nil {
		t.Fatalf("expected users.totp_enabled from migration 3: %v", err)
	}
	// And a table from migration 4.
	if _, err := s.db.ExecContext(ctx, `SELECT token_hash FROM preview_tokens LIMIT 1`); err != nil {
		t.Fatalf("expected preview_tokens from migration 4: %v", err)
	}
}
