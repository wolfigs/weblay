// Command weblay-seed idempotently provisions a demo/admin account and a site
// with a fixed site key into the configured backend (SQLite, Postgres, or
// MongoDB). It exists for local demos and POCs where the connector script tag
// hardcodes a site key that must exist in the database.
//
// It is a dev tool, not part of the shipped server. All values come from the
// environment so no demo data is baked into the product.
//
//	WEBLAY_DSN, WEBLAY_DB, WEBLAY_DATA  — same as the server (choose the backend)
//	SEED_EMAIL, SEED_PASSWORD, SEED_NAME
//	SEED_SITE_KEY, SEED_SITE_NAME
//	SEED_ORIGINS                        — comma-separated allowed origins
package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"errors"

	"github.com/wolfigs/weblay/internal/auth"
	"github.com/wolfigs/weblay/internal/config"
	"github.com/wolfigs/weblay/internal/store"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "seed:", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(config.Options{
		DataDir: envOr("WEBLAY_DATA", "./weblay-data"),
		DSN:     os.Getenv("WEBLAY_DSN"),
		DBName:  os.Getenv("WEBLAY_DB"),
	})
	if err != nil {
		return err
	}
	st, err := store.Open(cfg)
	if err != nil {
		return fmt.Errorf("open store: %w", err)
	}
	defer st.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	email := strings.ToLower(envOr("SEED_EMAIL", "demo@wolfigs.dev"))
	password := envOr("SEED_PASSWORD", "demo-pass-1234")
	name := envOr("SEED_NAME", "Demo")
	siteKey := envOr("SEED_SITE_KEY", "")
	siteName := envOr("SEED_SITE_NAME", "Demo Site")
	origins := splitList(os.Getenv("SEED_ORIGINS"))

	// User (create if missing).
	user, err := st.UserByEmail(ctx, email)
	if errors.Is(err, store.ErrNotFound) {
		hash, herr := auth.HashPassword(password)
		if herr != nil {
			return herr
		}
		user = &store.User{ID: store.NewID(), Email: email, Name: name, PasswordHash: hash, Role: "admin", CreatedAt: time.Now().UTC()}
		if err := st.CreateUser(ctx, user); err != nil {
			return fmt.Errorf("create user: %w", err)
		}
		fmt.Printf("seed: created user %s\n", email)
	} else if err != nil {
		return err
	} else {
		fmt.Printf("seed: user %s already exists\n", email)
	}

	// Site with a fixed key (create if missing).
	if siteKey != "" {
		site, err := st.SiteByKey(ctx, siteKey)
		if errors.Is(err, store.ErrNotFound) {
			site = &store.Site{ID: store.NewID(), SiteKey: siteKey, Name: siteName, CreatedBy: user.ID, CreatedAt: time.Now().UTC()}
			if err := st.CreateSite(ctx, site); err != nil {
				return fmt.Errorf("create site: %w", err)
			}
			fmt.Printf("seed: created site %s (%s)\n", siteName, siteKey)
		} else if err != nil {
			return err
		} else {
			fmt.Printf("seed: site %s already exists\n", siteKey)
		}
		// Ensure the seed user is a member and every origin is allowed.
		if ok, _ := st.IsMember(ctx, site.ID, user.ID); !ok {
			if err := st.AddMember(ctx, site.ID, user.ID, "owner"); err != nil {
				return err
			}
		}
		for _, o := range origins {
			if err := st.AddOrigin(ctx, site.ID, o); err != nil {
				return err
			}
		}
		if len(origins) > 0 {
			fmt.Printf("seed: allowed origins %s\n", strings.Join(origins, ", "))
		}
	}
	fmt.Printf("seed: done (backend=%s)\n", st.Kind())
	return nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func splitList(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, strings.TrimRight(p, "/"))
		}
	}
	return out
}
