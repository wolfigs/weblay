package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"strings"
	"time"
)

// User is an Weblay dashboard account.
type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	Name         string    `json:"name"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`
	CreatedAt    time.Time `json:"createdAt"`
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
func (s *Store) CountUsers(ctx context.Context) (int, error) {
	var n int
	err := s.queryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&n)
	return n, err
}

// CreateUser inserts a new account.
func (s *Store) CreateUser(ctx context.Context, u *User) error {
	u.Email = strings.ToLower(strings.TrimSpace(u.Email))
	_, err := s.exec(ctx,
		`INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		u.ID, u.Email, u.Name, u.PasswordHash, u.Role, u.CreatedAt)
	return err
}

// UserByEmail fetches an account by email.
func (s *Store) UserByEmail(ctx context.Context, email string) (*User, error) {
	return s.scanUser(s.queryRow(ctx,
		`SELECT id, email, name, password_hash, role, created_at FROM users WHERE email = ?`,
		strings.ToLower(strings.TrimSpace(email))))
}

// UserByID fetches an account by id.
func (s *Store) UserByID(ctx context.Context, id string) (*User, error) {
	return s.scanUser(s.queryRow(ctx,
		`SELECT id, email, name, password_hash, role, created_at FROM users WHERE id = ?`, id))
}

func (s *Store) scanUser(row *sql.Row) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.Role, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// --- Sessions (dashboard cookie auth) ---

// CreateSession stores a session token hash for a user.
func (s *Store) CreateSession(ctx context.Context, tokenHash, userID string, expires time.Time) error {
	_, err := s.exec(ctx,
		`INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
		tokenHash, userID, expires, time.Now().UTC())
	return err
}

// UserBySession resolves a live session token hash to its user.
func (s *Store) UserBySession(ctx context.Context, tokenHash string) (*User, error) {
	return s.scanUser(s.queryRow(ctx,
		`SELECT u.id, u.email, u.name, u.password_hash, u.role, u.created_at
		 FROM sessions s JOIN users u ON u.id = s.user_id
		 WHERE s.token_hash = ? AND s.expires_at > ?`,
		tokenHash, time.Now().UTC()))
}

// DeleteSession removes a session (logout).
func (s *Store) DeleteSession(ctx context.Context, tokenHash string) error {
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
func (s *Store) CreateEditToken(ctx context.Context, tokenHash, userID, siteID string, expires time.Time) error {
	_, err := s.exec(ctx,
		`INSERT INTO edit_tokens (token_hash, user_id, site_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
		tokenHash, userID, siteID, expires, time.Now().UTC())
	return err
}

// EditGrantByToken resolves a live edit token hash to its grant.
func (s *Store) EditGrantByToken(ctx context.Context, tokenHash string) (*EditGrant, error) {
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
func (s *Store) PruneExpired(ctx context.Context) error {
	now := time.Now().UTC()
	if _, err := s.exec(ctx, `DELETE FROM sessions WHERE expires_at <= ?`, now); err != nil {
		return err
	}
	_, err := s.exec(ctx, `DELETE FROM edit_tokens WHERE expires_at <= ?`, now)
	return err
}
