package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/wolfigs/weblay/internal/auth"
	"github.com/wolfigs/weblay/internal/store"
)

// The platform admin panel: the Wolfigs super admin manages accounts and admin
// roles across the platform. These endpoints are guarded by withSuperAdmin /
// withPermission(manage_users).

// handleAdminOverview returns platform-wide stats for the admin dashboard.
func (s *Server) handleAdminOverview(w http.ResponseWriter, r *http.Request) {
	users, err := s.st.ListUsers(r.Context())
	if err != nil {
		s.internalError(w, err)
		return
	}
	var admins, supers int
	for _, u := range users {
		switch u.Role {
		case store.RoleSuperAdmin:
			supers++
		case store.RoleAdmin:
			admins++
		}
	}
	totalSites := 0
	if sites, err := s.st.AllSites(r.Context()); err == nil {
		totalSites = len(sites)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"brand":       s.cfg.BrandName,
		"product":     s.cfg.ProductName,
		"totalUsers":  len(users),
		"admins":      admins,
		"superAdmins": supers,
		"totalSites":  totalSites,
		"permissions": store.AllPermissions,
		"roles":       []string{store.RoleSuperAdmin, store.RoleAdmin, store.RoleMember},
	})
}

// handleAdminSitesList returns every website on the platform (super admin /
// manage_sites), each with its health-issue count, for the admin panel's site
// oversight view.
func (s *Server) handleAdminSitesList(w http.ResponseWriter, r *http.Request) {
	sites, err := s.st.AllSites(r.Context())
	if err != nil {
		s.internalError(w, err)
		return
	}
	ids := make([]string, len(sites))
	for i, st := range sites {
		ids[i] = st.ID
	}
	issues, _ := s.st.IssueCountsForSites(r.Context(), ids)

	// Resolve owner emails (best-effort) so the admin sees who owns each site.
	ownerEmail := map[string]string{}
	out := make([]map[string]any, len(sites))
	for i, st := range sites {
		email := ownerEmail[st.CreatedBy]
		if email == "" {
			if u, err := s.st.UserByID(r.Context(), st.CreatedBy); err == nil {
				email = u.Email
				ownerEmail[st.CreatedBy] = email
			}
		}
		out[i] = map[string]any{
			"id": st.ID, "siteKey": st.SiteKey, "name": st.Name,
			"createdBy": st.CreatedBy, "ownerEmail": email, "createdAt": st.CreatedAt,
			"origins": st.Origins, "issues": issues[st.ID],
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"sites": out})
}

// handleAdminUsersList lists every account. Requires manage_users.
func (s *Server) handleAdminUsersList(w http.ResponseWriter, r *http.Request) {
	users, err := s.st.ListUsers(r.Context())
	if err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}

type adminUserBody struct {
	Email       string   `json:"email"`
	Name        string   `json:"name"`
	Password    string   `json:"password"`
	Role        string   `json:"role"`
	Permissions []string `json:"permissions"`
}

// handleAdminUserCreate creates a new account with a platform role. Only the
// super admin may mint admins; creating a plain member requires manage_users.
func (s *Server) handleAdminUserCreate(w http.ResponseWriter, r *http.Request) {
	actor := userFrom(r)
	var body adminUserBody
	if !readJSON(w, r, &body) {
		return
	}
	if !strings.Contains(body.Email, "@") {
		writeError(w, http.StatusBadRequest, "valid email required")
		return
	}
	role, perms, ok := s.resolveRole(w, actor, body.Role, body.Permissions)
	if !ok {
		return
	}
	if _, err := s.st.UserByEmail(r.Context(), body.Email); err == nil {
		writeError(w, http.StatusConflict, "an account with that email already exists")
		return
	} else if !errors.Is(err, store.ErrNotFound) {
		s.internalError(w, err)
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
		Role:         role,
		Permissions:  perms,
		CreatedAt:    time.Now().UTC(),
	}
	if err := s.st.CreateUser(r.Context(), u); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, u)
}

// handleAdminUserUpdate changes an account's role/permissions.
func (s *Server) handleAdminUserUpdate(w http.ResponseWriter, r *http.Request) {
	actor := userFrom(r)
	id := r.PathValue("userID")
	target, err := s.st.UserByID(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "account not found")
		return
	}
	if err != nil {
		s.internalError(w, err)
		return
	}
	// The super admin cannot be demoted through this endpoint — it protects the
	// platform from being locked out of its own owner account.
	if target.IsSuperAdmin() {
		writeError(w, http.StatusForbidden, "the super admin role cannot be changed here")
		return
	}
	var body adminUserBody
	if !readJSON(w, r, &body) {
		return
	}
	role, perms, ok := s.resolveRole(w, actor, body.Role, body.Permissions)
	if !ok {
		return
	}
	if err := s.st.UpdateUserRole(r.Context(), id, role, perms); err != nil {
		s.internalError(w, err)
		return
	}
	updated, _ := s.st.UserByID(r.Context(), id)
	writeJSON(w, http.StatusOK, updated)
}

// handleAdminUserDelete removes an account. Super-admin only; cannot remove the
// super admin or oneself.
func (s *Server) handleAdminUserDelete(w http.ResponseWriter, r *http.Request) {
	actor := userFrom(r)
	id := r.PathValue("userID")
	if id == actor.ID {
		writeError(w, http.StatusForbidden, "you cannot remove your own account")
		return
	}
	target, err := s.st.UserByID(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "account not found")
		return
	}
	if err != nil {
		s.internalError(w, err)
		return
	}
	if target.IsSuperAdmin() {
		writeError(w, http.StatusForbidden, "the super admin account cannot be removed")
		return
	}
	if err := s.st.DeleteUser(r.Context(), id); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}

// resolveRole validates a requested role + permissions against what the actor is
// allowed to grant, returning the effective values. Writes an error and returns
// ok=false on violation.
func (s *Server) resolveRole(w http.ResponseWriter, actor *store.User, role string, perms []string) (string, []string, bool) {
	switch role {
	case "", store.RoleMember:
		return store.RoleMember, nil, true
	case store.RoleAdmin:
		// Only the super admin may appoint admins.
		if !actor.IsSuperAdmin() {
			writeError(w, http.StatusForbidden, "only the super admin can grant admin roles")
			return "", nil, false
		}
		clean := make([]string, 0, len(perms))
		for _, p := range perms {
			if !store.ValidPermission(p) {
				writeError(w, http.StatusBadRequest, "unknown permission: "+p)
				return "", nil, false
			}
			clean = append(clean, p)
		}
		return store.RoleAdmin, clean, true
	case store.RoleSuperAdmin:
		writeError(w, http.StatusForbidden, "there can only be one super admin")
		return "", nil, false
	default:
		writeError(w, http.StatusBadRequest, "unknown role: "+role)
		return "", nil, false
	}
}
