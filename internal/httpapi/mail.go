package httpapi

import (
	"context"
	"log/slog"
)

// Mailer delivers transactional emails (password reset, verification). The
// default implementation logs the message so local/dev installs work without an
// SMTP provider; production wires a real sender behind the same interface.
type Mailer interface {
	Send(ctx context.Context, to, subject, body string) error
}

// logMailer writes emails to the structured log. In dev the reset/verify links
// are visible in the server output; it never silently drops mail.
type logMailer struct{ log *slog.Logger }

func (m logMailer) Send(_ context.Context, to, subject, body string) error {
	m.log.Info("email (dev log mailer — not actually sent)",
		"to", to, "subject", subject, "body", body)
	return nil
}
