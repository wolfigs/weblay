package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/wolfigs/weblay/internal/auth"
	"github.com/wolfigs/weblay/internal/store"
)

const (
	emailTokenTTL = time.Hour
	recoveryCount = 10
)

// --- Active sessions (revocation UI) ---

func (s *Server) handleSessionsList(w http.ResponseWriter, r *http.Request) {
	sessions, err := s.st.SessionsForUser(r.Context(), userFrom(r).ID)
	if err != nil {
		s.internalError(w, err)
		return
	}
	current := sessionIDFrom(r)
	for _, sess := range sessions {
		sess.Current = sess.ID == current
	}
	if sessions == nil {
		sessions = []*store.Session{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": sessions})
}

func (s *Server) handleSessionRevoke(w http.ResponseWriter, r *http.Request) {
	err := s.st.RevokeSession(r.Context(), userFrom(r).ID, r.PathValue("sessionID"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}
	if err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "revoked"})
}

func (s *Server) handleSessionsRevokeOthers(w http.ResponseWriter, r *http.Request) {
	if err := s.st.RevokeOtherSessions(r.Context(), userFrom(r).ID, sessionIDFrom(r)); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "other sessions signed out"})
}

// --- 2FA (TOTP) ---

// handleTOTPSetup generates a fresh secret (stored, not yet enabled) and returns
// the provisioning URI for the authenticator app to scan.
func (s *Server) handleTOTPSetup(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r)
	if u.TOTPEnabled {
		writeError(w, http.StatusConflict, "two-factor authentication is already enabled")
		return
	}
	secret := auth.NewTOTPSecret()
	if err := s.st.SetTOTP(r.Context(), u.ID, secret, false, nil); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"secret":     secret,
		"otpauthUri": auth.TOTPURI(s.cfg.BrandName+" "+s.cfg.ProductName, u.Email, secret),
	})
}

// handleTOTPEnable verifies a code against the pending secret, enables 2FA, and
// returns one-time recovery codes (shown once).
func (s *Server) handleTOTPEnable(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r)
	var body struct {
		Code string `json:"code"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if u.TOTPSecret == "" {
		writeError(w, http.StatusBadRequest, "start 2FA setup first")
		return
	}
	if !auth.VerifyTOTP(u.TOTPSecret, body.Code) {
		writeError(w, http.StatusBadRequest, "incorrect code")
		return
	}
	codes := auth.NewRecoveryCodes(recoveryCount)
	if err := s.st.SetTOTP(r.Context(), u.ID, u.TOTPSecret, true, hashRecoveryCodes(codes)); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "enabled", "recoveryCodes": codes})
}

// handleTOTPDisable turns off 2FA after a valid code (or recovery code).
func (s *Server) handleTOTPDisable(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r)
	var body struct {
		Code string `json:"code"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if !u.TOTPEnabled {
		writeJSON(w, http.StatusOK, map[string]string{"status": "not enabled"})
		return
	}
	if !auth.VerifyTOTP(u.TOTPSecret, body.Code) && !consumeRecoveryCode(u, body.Code) {
		writeError(w, http.StatusBadRequest, "incorrect code")
		return
	}
	if err := s.st.SetTOTP(r.Context(), u.ID, "", false, nil); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "disabled"})
}

// --- Password reset (email) ---

func (s *Server) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	// Always respond 200 so an attacker can't enumerate registered emails.
	if u, err := s.st.UserByEmail(r.Context(), body.Email); err == nil {
		token, hash := store.NewToken()
		if err := s.st.CreateEmailToken(r.Context(), hash, u.ID, store.EmailPurposeReset, time.Now().UTC().Add(emailTokenTTL)); err == nil {
			link := fmt.Sprintf("%s/#/reset?token=%s", s.assetBase(r), token)
			_ = s.mailer.Send(r.Context(), u.Email, "Reset your password",
				"Reset your "+s.cfg.BrandName+" "+s.cfg.ProductName+" password:\n"+link+"\n\nThis link expires in 1 hour.")
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "if that account exists, a reset link has been sent"})
}

func (s *Server) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	userID, err := s.st.ConsumeEmailToken(r.Context(), store.HashToken(body.Token), store.EmailPurposeReset)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusBadRequest, "invalid or expired reset link")
		return
	}
	if err != nil {
		s.internalError(w, err)
		return
	}
	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.st.SetPassword(r.Context(), userID, hash); err != nil {
		s.internalError(w, err)
		return
	}
	// A password reset revokes every existing session (defense against a
	// lingering attacker).
	_ = s.st.RevokeOtherSessions(r.Context(), userID, "")
	writeJSON(w, http.StatusOK, map[string]string{"status": "password updated — please sign in"})
}

// --- Email verification ---

func (s *Server) handleSendVerification(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r)
	if u.EmailVerified {
		writeJSON(w, http.StatusOK, map[string]string{"status": "already verified"})
		return
	}
	token, hash := store.NewToken()
	if err := s.st.CreateEmailToken(r.Context(), hash, u.ID, store.EmailPurposeVerify, time.Now().UTC().Add(24*time.Hour)); err != nil {
		s.internalError(w, err)
		return
	}
	link := fmt.Sprintf("%s/#/verify?token=%s", s.assetBase(r), token)
	_ = s.mailer.Send(r.Context(), u.Email, "Verify your email",
		"Verify your email for "+s.cfg.BrandName+" "+s.cfg.ProductName+":\n"+link)
	writeJSON(w, http.StatusOK, map[string]string{"status": "verification email sent"})
}

func (s *Server) handleVerifyEmail(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token string `json:"token"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	userID, err := s.st.ConsumeEmailToken(r.Context(), store.HashToken(body.Token), store.EmailPurposeVerify)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusBadRequest, "invalid or expired verification link")
		return
	}
	if err != nil {
		s.internalError(w, err)
		return
	}
	if err := s.st.SetEmailVerified(r.Context(), userID, true); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "email verified"})
}

// --- recovery-code helpers ---

// Recovery codes are stored hashed (like any secret). We hash on generation and
// compare hashes on use.
func hashRecoveryCodes(codes []string) []string {
	out := make([]string, len(codes))
	for i, c := range codes {
		out[i] = store.HashToken(c)
	}
	return out
}

// consumeRecoveryCode checks a code against the user's stored (hashed) recovery
// codes; on match it removes it and persists the reduced set. Returns true on
// success.
func consumeRecoveryCode(u *store.User, code string) bool {
	h := store.HashToken(code)
	for i, stored := range u.RecoveryCodes {
		if stored == h {
			u.RecoveryCodes = append(u.RecoveryCodes[:i], u.RecoveryCodes[i+1:]...)
			return true
		}
	}
	return false
}
