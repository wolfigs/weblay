package httpapi

import (
	"bytes"
	"context"
	"log/slog"
	"net/http/httptest"
	"testing"

	"github.com/wolfigs/weblay/internal/config"
	"github.com/wolfigs/weblay/internal/store"
)

// TestSuperAdminBootstrapCreatesAccount verifies the fix: when
// WEBLAY_SUPER_ADMIN_PASSWORD is set and the account is absent, startup creates
// the super admin so it exists and can sign in — not just "promote if present".
func TestSuperAdminBootstrapCreatesAccount(t *testing.T) {
	cfg, err := config.Load(config.Options{
		DataDir:            t.TempDir(),
		BaseURL:            "http://weblay.test",
		SuperAdminEmail:    "sathnidukottage@gmail.com",
		SuperAdminPassword: "a-strong-bootstrap-pass",
	})
	if err != nil {
		t.Fatal(err)
	}
	st, err := store.Open(cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })

	srv := httptest.NewServer(New(cfg, st, slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)), "test"))
	t.Cleanup(srv.Close)
	h := &harness{t: t, srv: srv, client: newJarClient()}

	// The account now exists as a super admin and can log in.
	res, out := h.do("POST", "/api/v1/auth/login", map[string]string{
		"email": "sathnidukottage@gmail.com", "password": "a-strong-bootstrap-pass",
	})
	h.expect(res, 200, out)
	if out["role"] != "super_admin" {
		t.Fatalf("bootstrapped role = %v, want super_admin", out["role"])
	}
	if out["emailVerified"] != true {
		t.Errorf("bootstrapped super admin should be email-verified")
	}

	// It is the super admin who can reach the admin panel.
	res, out = h.do("GET", "/api/v1/admin/overview", nil)
	h.expect(res, 200, out)
	if out["superAdmins"].(float64) != 1 {
		t.Fatalf("superAdmins = %v, want 1", out["superAdmins"])
	}
}

// Without a password, an absent super admin is left for first-run setup (no
// account is silently created without a credential).
func TestSuperAdminBootstrapNoPasswordIsNoop(t *testing.T) {
	cfg, err := config.Load(config.Options{DataDir: t.TempDir(), BaseURL: "http://weblay.test"})
	if err != nil {
		t.Fatal(err)
	}
	st, err := store.Open(cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	_ = New(cfg, st, slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)), "test")

	if n, _ := st.CountUsers(context.Background()); n != 0 {
		t.Fatalf("expected no accounts without a bootstrap password, got %d", n)
	}
}
