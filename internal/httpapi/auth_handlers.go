package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/wolfigs/inlay/internal/auth"
	"github.com/wolfigs/inlay/internal/store"
)

const (
	sessionTTL   = 30 * 24 * time.Hour
	editTokenTTL = 4 * time.Hour
)

// handleStatus tells the admin UI whether first-run setup is needed.
func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	n, err := s.st.CountUsers(r.Context())
	if err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"version":     s.version,
		"needsSetup":  n == 0,
	})
}

type credentialsBody struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

// handleSetup creates the first admin account. Only valid while no users exist.
func (s *Server) handleSetup(w http.ResponseWriter, r *http.Request) {
	n, err := s.st.CountUsers(r.Context())
	if err != nil {
		s.internalError(w, err)
		return
	}
	if n > 0 {
		writeError(w, http.StatusForbidden, "setup already completed")
		return
	}
	var body credentialsBody
	if !readJSON(w, r, &body) {
		return
	}
	if !strings.Contains(body.Email, "@") {
		writeError(w, http.StatusBadRequest, "valid email required")
		return
	}
	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	u := &store.User{
		ID:           store.NewID(),
		Email:        body.Email,
		Name:         body.Name,
		PasswordHash: hash,
		Role:         "admin",
		CreatedAt:    time.Now().UTC(),
	}
	if err := s.st.CreateUser(r.Context(), u); err != nil {
		s.internalError(w, err)
		return
	}
	s.startSession(w, r, u)
}

// handleLogin verifies credentials and issues a session cookie.
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body credentialsBody
	if !readJSON(w, r, &body) {
		return
	}
	u, err := s.st.UserByEmail(r.Context(), body.Email)
	if errors.Is(err, store.ErrNotFound) {
		// Burn comparable time so missing accounts aren't distinguishable.
		auth.VerifyPassword(body.Password, "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if err != nil {
		s.internalError(w, err)
		return
	}
	if !auth.VerifyPassword(body.Password, u.PasswordHash) {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	s.startSession(w, r, u)
}

func (s *Server) startSession(w http.ResponseWriter, r *http.Request, u *store.User) {
	token, hash := store.NewToken()
	if err := s.st.CreateSession(r.Context(), hash, u.ID, time.Now().UTC().Add(sessionTTL)); err != nil {
		s.internalError(w, err)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   r.TLS != nil || strings.HasPrefix(s.cfg.BaseURL, "https://"),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(sessionTTL.Seconds()),
	})
	writeJSON(w, http.StatusOK, u)
}

// handleLogout deletes the session and clears the cookie.
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil && c.Value != "" {
		_ = s.st.DeleteSession(r.Context(), store.HashToken(c.Value))
	}
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: "", Path: "/", HttpOnly: true, MaxAge: -1,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "signed out"})
}

// handleMe returns the current account.
func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, userFrom(r))
}

// handleEditTokenIssue mints a short-lived bearer token for on-site editing.
// The dashboard opens the site with this token in the URL fragment; the
// connector picks it up and unlocks the editor.
func (s *Server) handleEditTokenIssue(w http.ResponseWriter, r *http.Request) {
	u, site := userFrom(r), siteFrom(r)
	token, hash := store.NewToken()
	expires := time.Now().UTC().Add(editTokenTTL)
	if err := s.st.CreateEditToken(r.Context(), hash, u.ID, site.ID, expires); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"token":     token,
		"expiresAt": expires,
	})
}
