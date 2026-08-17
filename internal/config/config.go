// Package config holds runtime configuration for the Weblay server.
package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Config is the resolved server configuration.
type Config struct {
	Addr    string
	DataDir string
	DSN     string // empty means SQLite in DataDir; mongodb[+srv]:// selects Mongo
	DBName  string // database name for MongoDB (ignored for SQL backends)
	BaseURL string // public URL of this server, no trailing slash

	// Secret signs nothing directly today (tokens are DB-backed) but is
	// reserved in the data dir so future signed features don't rotate keys
	// out from under existing deployments.
	Secret string

	// Brand / product identity. Weblay is the first Wolfigs product; the shared
	// Wolfigs account is the gateway for all of them (Datalay coming next).
	BrandName   string // "Wolfigs"
	ProductName string // "Weblay"

	// SuperAdminEmail is the bootstrap super admin — the one account that always
	// holds full platform control and can appoint other admins.
	SuperAdminEmail string
	// SuperAdminPassword, when set (env WEBLAY_SUPER_ADMIN_PASSWORD), creates the
	// super-admin account on startup if it does not exist yet. Never defaulted.
	SuperAdminPassword string

	UploadsDir    string
	MaxUploadSize int64
	// MaxSiteStorageBytes caps total uploaded bytes per site (abuse / cost guard).
	MaxSiteStorageBytes int64

	// DriftCrawl enables the background drift crawler; DriftInterval is how often
	// it re-checks each site's bindings. Zero interval disables it.
	DriftInterval time.Duration
}

// Options are the raw inputs from flags/env before validation.
type Options struct {
	Addr            string
	DataDir         string
	DSN             string
	DBName          string
	BaseURL            string
	SuperAdminEmail    string
	SuperAdminPassword string
	DriftInterval      time.Duration
}

// DefaultMongoDB is the MongoDB database used when none is configured.
const DefaultMongoDB = "weblay-central"

// DefaultSuperAdminEmail is the bootstrap super admin when none is configured.
const DefaultSuperAdminEmail = "sathnidukottage@gmail.com"

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

	dbName := strings.TrimSpace(opts.DBName)
	if dbName == "" {
		dbName = DefaultMongoDB
	}

	superEmail := strings.ToLower(strings.TrimSpace(opts.SuperAdminEmail))
	if superEmail == "" {
		superEmail = DefaultSuperAdminEmail
	}

	return &Config{
		Addr:          opts.Addr,
		DataDir:       dataDir,
		DSN:           opts.DSN,
		DBName:        dbName,
		BaseURL:         strings.TrimRight(opts.BaseURL, "/"),
		Secret:          secret,
		BrandName:          "Wolfigs",
		ProductName:        "Weblay",
		SuperAdminEmail:    superEmail,
		SuperAdminPassword: opts.SuperAdminPassword,
		UploadsDir:          uploadsDir,
		MaxUploadSize:       10 << 20,  // 10 MiB
		MaxSiteStorageBytes: 500 << 20, // 500 MiB per site
		DriftInterval:       opts.DriftInterval,
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
