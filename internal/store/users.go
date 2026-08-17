package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Platform-level account roles for the shared Wolfigs account (the gateway for
// all Wolfigs products, of which Weblay is the first). Distinct from per-site
// membership roles (owner/editor).
const (
	RoleSuperAdmin = "super_admin" // full control; can manage admins; bootstrap holder
	RoleAdmin      = "admin"       // platform admin, scoped by Permissions
	RoleMember     = "member"      // ordinary product user (default)
)

// Granular admin permissions. The super admin implicitly holds all of them.
const (
	PermManageUsers   = "manage_users"   // list/create/modify/remove accounts and admins
	PermManageSites   = "manage_sites"   // administer any site across the platform
	PermManageContent = "manage_content" // edit/publish content on any site
	PermManageBilling = "manage_billing" // plans, quotas, invoices
	PermViewMetrics   = "view_metrics"   // platform observability / analytics
)

// AllPermissions is the canonical set, used for validation and to grant the
// super admin everything.
var AllPermissions = []string{
	PermManageUsers, PermManageSites, PermManageContent, PermManageBilling, PermViewMetrics,
}

// ValidPermission reports whether p is a known permission.
func ValidPermission(p string) bool {
	for _, x := range AllPermissions {
		if x == p {
			return true
		}
	}
	return false
}

// User is a Wolfigs account (shared across Wolfigs products).
type User struct {
	ID            string    `json:"id"`
	Email         string    `json:"email"`
	Name          string    `json:"name"`
	PasswordHash  string    `json:"-"`
	Role          string    `json:"role"`
	Permissions   []string  `json:"permissions"`
	EmailVerified bool      `json:"emailVerified"`
	TOTPSecret    string    `json:"-"`
	TOTPEnabled   bool      `json:"totpEnabled"`
	RecoveryCodes []string  `json:"-"`
	CreatedAt     time.Time `json:"createdAt"`
}

// IsSuperAdmin reports whether the account is the super admin.
func (u *User) IsSuperAdmin() bool { return u.Role == RoleSuperAdmin }

// IsAdmin reports platform-admin standing (admin or super admin).
func (u *User) IsAdmin() bool { return u.Role == RoleAdmin || u.Role == RoleSuperAdmin }

// Can reports whether the account holds a permission. The super admin holds all
// permissions unconditionally.
func (u *User) Can(perm string) bool {
	if u.Role == RoleSuperAdmin {
		return true
	}
	for _, p := range u.Permissions {
		if p == perm {
			return true
		}
	}
	return false
}

// NewID returns a random 128-bit hex identifier.
func NewID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err) // crypto/rand failure is unrecoverable
	}
	return hex.EncodeToString(b)
}

// NewToken returns a random bearer token and the hash under which it is stored.
func NewToken() (token, hash string) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	token = hex.EncodeToString(b)
	return token, HashToken(token)
}

// HashToken hashes a bearer token for storage and lookup.
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// CountUsers reports how many accounts exist (0 triggers first-run setup).
func (s *sqlStore) CountUsers(ctx context.Context) (int, error) {
	var n int
	err := s.queryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&n)
	return n, err
}

// userCols is the column list for every user SELECT, matching scanUserRow.
const userCols = `id, email, name, password_hash, role, permissions_json,
	email_verified, totp_secret, totp_enabled, recovery_codes_json, created_at`

// CreateUser inserts a new account.
func (s *sqlStore) CreateUser(ctx context.Context, u *User) error {
	u.Email = strings.ToLower(strings.TrimSpace(u.Email))
	_, err := s.exec(ctx,
		`INSERT INTO users (id, email, name, password_hash, role, permissions_json,
			email_verified, totp_secret, totp_enabled, recovery_codes_json, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		u.ID, u.Email, u.Name, u.PasswordHash, u.Role, marshalPerms(u.Permissions),
		boolInt(u.EmailVerified), u.TOTPSecret, boolInt(u.TOTPEnabled), marshalPerms(u.RecoveryCodes), u.CreatedAt)
	return err
}

// UserByEmail fetches an account by email.
func (s *sqlStore) UserByEmail(ctx context.Context, email string) (*User, error) {
	return s.scanUser(s.queryRow(ctx,
		`SELECT `+userCols+` FROM users WHERE email = ?`,
		strings.ToLower(strings.TrimSpace(email))))
}

// UserByID fetches an account by id.
func (s *sqlStore) UserByID(ctx context.Context, id string) (*User, error) {
	return s.scanUser(s.queryRow(ctx,
		`SELECT `+userCols+` FROM users WHERE id = ?`, id))
}

// ListUsers returns every account, newest first — for the admin panel.
func (s *sqlStore) ListUsers(ctx context.Context) ([]*User, error) {
	rows, err := s.query(ctx,
		`SELECT `+userCols+` FROM users ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var users []*User
	for rows.Next() {
		u, err := scanUserRow(rows.Scan)
		if err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// UpdateUserRole changes an account's platform role and permissions.
func (s *sqlStore) UpdateUserRole(ctx context.Context, id, role string, perms []string) error {
	res, err := s.exec(ctx,
		`UPDATE users SET role = ?, permissions_json = ? WHERE id = ?`,
		role, marshalPerms(perms), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// EnsureSuperAdmin promotes the account with the given email to super admin
// (with all permissions) if it exists and is not already. It is a no-op when the
// account is absent — the super admin is created at first-run setup — so it just
// guarantees the configured owner email always holds full control. Returns true
// if a promotion happened.
func (s *sqlStore) EnsureSuperAdmin(ctx context.Context, email string) (bool, error) {
	u, err := s.UserByEmail(ctx, email)
	if errors.Is(err, ErrNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if u.Role == RoleSuperAdmin {
		return false, nil
	}
	if err := s.UpdateUserRole(ctx, u.ID, RoleSuperAdmin, AllPermissions); err != nil {
		return false, err
	}
	return true, nil
}

// DeleteUser removes an account (and, via FK cascades, its sessions/tokens).
func (s *sqlStore) DeleteUser(ctx context.Context, id string) error {
	res, err := s.exec(ctx, `DELETE FROM users WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *sqlStore) scanUser(row *sql.Row) (*User, error) {
	return scanUserRow(row.Scan)
}

// scanUserRow decodes a user row from either *sql.Row or *sql.Rows via its Scan.
func scanUserRow(scan func(...any) error) (*User, error) {
	var u User
	var perms, recovery sql.NullString
	var emailVerified, totpEnabled int
	err := scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.Role, &perms,
		&emailVerified, &u.TOTPSecret, &totpEnabled, &recovery, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	u.Permissions = unmarshalPerms(perms.String)
	u.RecoveryCodes = unmarshalPerms(recovery.String)
	u.EmailVerified = emailVerified != 0
	u.TOTPEnabled = totpEnabled != 0
	return &u, nil
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func marshalPerms(perms []string) string {
	if len(perms) == 0 {
		return "[]"
	}
	b, err := json.Marshal(perms)
	if err != nil {
		return "[]"
	}
	return string(b)
}

func unmarshalPerms(s string) []string {
	if s == "" {
		return nil
	}
	var out []string
	if err := json.Unmarshal([]byte(s), &out); err != nil {
		return nil
	}
	return out
}

// --- Sessions (dashboard cookie auth) ---

// CreateSession stores a session token hash for a user, with client metadata
// for the "active sessions" revocation UI.
func (s *sqlStore) CreateSession(ctx context.Context, tokenHash, userID, userAgent, ip string, expires time.Time) error {
	now := time.Now().UTC()
	_, err := s.exec(ctx,
		`INSERT INTO sessions (token_hash, user_id, expires_at, created_at, user_agent, ip, last_seen)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		tokenHash, userID, expires, now, userAgent, ip, now)
	return err
}

// UserBySession resolves a live session token hash to its user.
func (s *sqlStore) UserBySession(ctx context.Context, tokenHash string) (*User, error) {
	return s.scanUser(s.queryRow(ctx,
		`SELECT u.id, u.email, u.name, u.password_hash, u.role, u.permissions_json,
			u.email_verified, u.totp_secret, u.totp_enabled, u.recovery_codes_json, u.created_at
		 FROM sessions s JOIN users u ON u.id = s.user_id
		 WHERE s.token_hash = ? AND s.expires_at > ?`,
		tokenHash, time.Now().UTC()))
}

// DeleteSession removes a session (logout).
func (s *sqlStore) DeleteSession(ctx context.Context, tokenHash string) error {
	_, err := s.exec(ctx, `DELETE FROM sessions WHERE token_hash = ?`, tokenHash)
	return err
}

// --- Edit tokens (bearer handoff for on-site editing) ---

// EditGrant is what an edit token authorizes: one user on one site.
type EditGrant struct {
	UserID string
	SiteID string
}

// CreateEditToken stores an edit token hash scoped to a site.
func (s *sqlStore) CreateEditToken(ctx context.Context, tokenHash, userID, siteID string, expires time.Time) error {
	_, err := s.exec(ctx,
		`INSERT INTO edit_tokens (token_hash, user_id, site_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
		tokenHash, userID, siteID, expires, time.Now().UTC())
	return err
}

// EditGrantByToken resolves a live edit token hash to its grant.
func (s *sqlStore) EditGrantByToken(ctx context.Context, tokenHash string) (*EditGrant, error) {
	var g EditGrant
	err := s.queryRow(ctx,
		`SELECT user_id, site_id FROM edit_tokens WHERE token_hash = ? AND expires_at > ?`,
		tokenHash, time.Now().UTC()).Scan(&g.UserID, &g.SiteID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &g, nil
}

// PruneExpired clears dead sessions and edit tokens; called periodically.
func (s *sqlStore) PruneExpired(ctx context.Context) error {
	now := time.Now().UTC()
	if _, err := s.exec(ctx, `DELETE FROM sessions WHERE expires_at <= ?`, now); err != nil {
		return err
	}
	_, err := s.exec(ctx, `DELETE FROM edit_tokens WHERE expires_at <= ?`, now)
	return err
}
