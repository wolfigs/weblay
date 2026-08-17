package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Session is an active dashboard login, surfaced in the account security UI so a
// user can review and revoke their sessions.
type Session struct {
	ID        string    `json:"id"` // opaque (the token hash); safe to expose, not the token
	UserAgent string    `json:"userAgent"`
	IP        string    `json:"ip"`
	CreatedAt time.Time `json:"createdAt"`
	LastSeen  time.Time `json:"lastSeen"`
	Current   bool      `json:"current"`
}

// Email token purposes.
const (
	EmailPurposeReset  = "password_reset"
	EmailPurposeVerify = "email_verify"
)

// --- Session management (revocation UI) ---

// SessionsForUser lists a user's live sessions, newest first.
func (s *sqlStore) SessionsForUser(ctx context.Context, userID string) ([]*Session, error) {
	rows, err := s.query(ctx,
		`SELECT token_hash, user_agent, ip, created_at, last_seen
		 FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC`,
		userID, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Session
	for rows.Next() {
		var sess Session
		var lastSeen sql.NullTime
		if err := rows.Scan(&sess.ID, &sess.UserAgent, &sess.IP, &sess.CreatedAt, &lastSeen); err != nil {
			return nil, err
		}
		if lastSeen.Valid {
			sess.LastSeen = lastSeen.Time.UTC()
		}
		out = append(out, &sess)
	}
	return out, rows.Err()
}

// RevokeSession deletes one of a user's sessions by id (its token hash). Scoped
// to the user so one account can never revoke another's session.
func (s *sqlStore) RevokeSession(ctx context.Context, userID, sessionID string) error {
	res, err := s.exec(ctx, `DELETE FROM sessions WHERE token_hash = ? AND user_id = ?`, sessionID, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// RevokeOtherSessions deletes every session for a user except the current one —
// "sign out everywhere else".
func (s *sqlStore) RevokeOtherSessions(ctx context.Context, userID, keepSessionID string) error {
	_, err := s.exec(ctx, `DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?`, userID, keepSessionID)
	return err
}

// TouchSession updates a session's last-seen time (best-effort, cheap).
func (s *sqlStore) TouchSession(ctx context.Context, sessionID string) error {
	_, err := s.exec(ctx, `UPDATE sessions SET last_seen = ? WHERE token_hash = ?`, time.Now().UTC(), sessionID)
	return err
}

// --- One-time email tokens (password reset + email verification) ---

// CreateEmailToken stores a hashed one-time token for a purpose.
func (s *sqlStore) CreateEmailToken(ctx context.Context, tokenHash, userID, purpose string, expires time.Time) error {
	_, err := s.exec(ctx,
		`INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
		tokenHash, userID, purpose, expires, time.Now().UTC())
	return err
}

// ConsumeEmailToken atomically validates and deletes a token, returning its user
// id. It fails if the token is missing, expired, or for a different purpose.
func (s *sqlStore) ConsumeEmailToken(ctx context.Context, tokenHash, purpose string) (string, error) {
	var userID string
	err := s.queryRow(ctx,
		`SELECT user_id FROM email_tokens WHERE token_hash = ? AND purpose = ? AND expires_at > ?`,
		tokenHash, purpose, time.Now().UTC()).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	if _, err := s.exec(ctx, `DELETE FROM email_tokens WHERE token_hash = ?`, tokenHash); err != nil {
		return "", err
	}
	return userID, nil
}

// --- Account credential updates ---

// SetPassword replaces a user's password hash.
func (s *sqlStore) SetPassword(ctx context.Context, userID, passwordHash string) error {
	res, err := s.exec(ctx, `UPDATE users SET password_hash = ? WHERE id = ?`, passwordHash, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// SetEmailVerified marks an account's email as verified.
func (s *sqlStore) SetEmailVerified(ctx context.Context, userID string, verified bool) error {
	_, err := s.exec(ctx, `UPDATE users SET email_verified = ? WHERE id = ?`, boolInt(verified), userID)
	return err
}

// SetTOTP updates a user's TOTP secret, enabled flag, and recovery codes.
func (s *sqlStore) SetTOTP(ctx context.Context, userID, secret string, enabled bool, recoveryCodes []string) error {
	res, err := s.exec(ctx,
		`UPDATE users SET totp_secret = ?, totp_enabled = ?, recovery_codes_json = ? WHERE id = ?`,
		secret, boolInt(enabled), marshalPerms(recoveryCodes), userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
