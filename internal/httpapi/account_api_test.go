package httpapi

import (
	"net/http"
	"testing"
	"time"

	"github.com/wolfigs/weblay/internal/auth"
)

func setupUser(t *testing.T, h *harness, email string) {
	t.Helper()
	res, out := h.do("POST", "/api/v1/auth/setup", map[string]string{
		"email": email, "password": "correct-horse-battery", "name": "U",
	})
	h.expect(res, 200, out)
}

func TestCSRFBlocksMissingToken(t *testing.T) {
	h := newHarness(t)
	setupUser(t, h, "a@wolfigs.dev")
	// A mutating request WITHOUT the CSRF header is rejected even with a valid
	// session cookie. Build it manually to bypass the harness auto-header.
	req, _ := http.NewRequest("POST", h.srv.URL+"/api/v1/sites", nil)
	res, err := h.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("missing CSRF token = %d, want 403", res.StatusCode)
	}
}

func TestSessionRevocation(t *testing.T) {
	h := newHarness(t)
	setupUser(t, h, "s@wolfigs.dev")

	// A second, independent login creates a second session.
	h2 := &harness{t: t, srv: h.srv, client: newJarClient()}
	res, out := h2.do("POST", "/api/v1/auth/login", map[string]string{"email": "s@wolfigs.dev", "password": "correct-horse-battery"})
	h2.expect(res, 200, out)

	// The first session sees two active sessions, exactly one marked current.
	res, list := h.do("GET", "/api/v1/me/sessions", nil)
	h.expect(res, 200, list)
	sessions := list["sessions"].([]any)
	if len(sessions) != 2 {
		t.Fatalf("got %d sessions, want 2", len(sessions))
	}
	var otherID string
	current := 0
	for _, s := range sessions {
		m := s.(map[string]any)
		if m["current"].(bool) {
			current++
		} else {
			otherID = m["id"].(string)
		}
	}
	if current != 1 {
		t.Fatalf("current sessions = %d, want 1", current)
	}

	// Revoke the other session; the second client is now signed out.
	res, out = h.do("DELETE", "/api/v1/me/sessions/"+otherID, nil)
	h.expect(res, 200, out)
	res, out = h2.do("GET", "/api/v1/me/sessions", nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("revoked session still valid: %d", res.StatusCode)
	}
}

func TestTwoFactorLoginFlow(t *testing.T) {
	h := newHarness(t)
	setupUser(t, h, "2fa@wolfigs.dev")

	// Enroll: setup returns a secret; enable with a valid code returns recovery codes.
	res, out := h.do("POST", "/api/v1/me/2fa/setup", nil)
	h.expect(res, 200, out)
	secret := out["secret"].(string)
	code, _ := auth.TOTPCode(secret, time.Now())

	res, out = h.do("POST", "/api/v1/me/2fa/enable", map[string]string{"code": code})
	h.expect(res, 200, out)
	recovery := out["recoveryCodes"].([]any)
	if len(recovery) != 10 {
		t.Fatalf("got %d recovery codes, want 10", len(recovery))
	}

	// Login now requires the second factor.
	fresh := &harness{t: t, srv: h.srv, client: newJarClient()}
	res, out = fresh.do("POST", "/api/v1/auth/login", map[string]string{"email": "2fa@wolfigs.dev", "password": "correct-horse-battery"})
	if res.StatusCode != http.StatusUnauthorized || out["totpRequired"] != true {
		t.Fatalf("login without code = %d %v, want 401 totpRequired", res.StatusCode, out)
	}
	code2, _ := auth.TOTPCode(secret, time.Now())
	res, out = fresh.do("POST", "/api/v1/auth/login", map[string]string{
		"email": "2fa@wolfigs.dev", "password": "correct-horse-battery", "code": code2,
	})
	fresh.expect(res, 200, out)

	// A recovery code also logs in (single use).
	rec := recovery[0].(string)
	rc := &harness{t: t, srv: h.srv, client: newJarClient()}
	res, out = rc.do("POST", "/api/v1/auth/login", map[string]string{
		"email": "2fa@wolfigs.dev", "password": "correct-horse-battery", "code": rec,
	})
	rc.expect(res, 200, out)
	// The same recovery code cannot be reused.
	rc2 := &harness{t: t, srv: h.srv, client: newJarClient()}
	res, out = rc2.do("POST", "/api/v1/auth/login", map[string]string{
		"email": "2fa@wolfigs.dev", "password": "correct-horse-battery", "code": rec,
	})
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("reused recovery code accepted: %d", res.StatusCode)
	}
}

func TestPasswordResetFlow(t *testing.T) {
	h := newHarness(t)
	setupUser(t, h, "reset@wolfigs.dev")

	// Forgot always returns 200 (no account enumeration).
	res, out := h.do("POST", "/api/v1/auth/forgot", map[string]string{"email": "reset@wolfigs.dev"})
	h.expect(res, 200, out)
	res, out = h.do("POST", "/api/v1/auth/forgot", map[string]string{"email": "nobody@wolfigs.dev"})
	h.expect(res, 200, out)

	// An invalid reset token is rejected.
	res, out = h.do("POST", "/api/v1/auth/reset", map[string]string{"token": "deadbeef", "password": "new-password-9999"})
	h.expect(res, http.StatusBadRequest, out)
}
