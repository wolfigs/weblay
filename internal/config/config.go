// Package config holds runtime configuration for the Inlay server.
package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Config is the resolved server configuration.
type Config struct {
	Addr    string
	DataDir string
	DSN     string // empty means SQLite in DataDir
	BaseURL string // public URL of this server, no trailing slash

	// Secret signs nothing directly today (tokens are DB-backed) but is
	// reserved in the data dir so future signed features don't rotate keys
	// out from under existing deployments.
	Secret string

	UploadsDir    string
	MaxUploadSize int64
}

// Options are the raw inputs from flags/env before validation.
type Options struct {
	Addr    string
	DataDir string
	DSN     string
	BaseURL string
}

// Load validates options, ensures the data directory exists, and loads or
// creates the instance secret.
func Load(opts Options) (*Config, error) {
	dataDir, err := filepath.Abs(opts.DataDir)
	if err != nil {
		return nil, fmt.Errorf("resolve data dir: %w", err)
	}
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}
	uploadsDir := filepath.Join(dataDir, "uploads")
	if err := os.MkdirAll(uploadsDir, 0o700); err != nil {
		return nil, fmt.Errorf("create uploads dir: %w", err)
	}

	secret, err := loadOrCreateSecret(filepath.Join(dataDir, "secret"))
	if err != nil {
		return nil, err
	}

	return &Config{
		Addr:          opts.Addr,
		DataDir:       dataDir,
		DSN:           opts.DSN,
		BaseURL:       strings.TrimRight(opts.BaseURL, "/"),
		Secret:        secret,
		UploadsDir:    uploadsDir,
		MaxUploadSize: 10 << 20, // 10 MiB
	}, nil
}

func loadOrCreateSecret(path string) (string, error) {
	if b, err := os.ReadFile(path); err == nil {
		s := strings.TrimSpace(string(b))
		if len(s) >= 32 {
			return s, nil
		}
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate secret: %w", err)
	}
	s := hex.EncodeToString(raw)
	if err := os.WriteFile(path, []byte(s+"\n"), 0o600); err != nil {
		return "", fmt.Errorf("persist secret: %w", err)
	}
	return s, nil
}
