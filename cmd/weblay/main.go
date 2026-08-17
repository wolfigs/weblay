package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/wolfigs/weblay/internal/config"
	"github.com/wolfigs/weblay/internal/httpapi"
	"github.com/wolfigs/weblay/internal/store"
)

var version = "dev"

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	switch os.Args[1] {
	case "serve":
		if err := serve(os.Args[2:]); err != nil {
			fmt.Fprintln(os.Stderr, "weblay:", err)
			os.Exit(1)
		}
	case "version":
		fmt.Println("weblay", version)
	case "help", "-h", "--help":
		usage()
	default:
		fmt.Fprintf(os.Stderr, "weblay: unknown command %q\n\n", os.Args[1])
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Print(`Weblay — visual in-place editing for any website.

Usage:
  weblay serve [flags]   Start the Weblay server
  weblay version         Print version

Flags for serve:
  -addr string    Listen address (default ":8787", env WEBLAY_ADDR)
  -data string    Data directory for uploads + SQLite DB (default "./weblay-data", env WEBLAY_DATA)
  -dsn string     Database DSN (env WEBLAY_DSN). Selects the backend:
                    empty                 → embedded SQLite (default)
                    postgres://…          → PostgreSQL
                    mongodb://… or
                    mongodb+srv://…       → MongoDB
  -db string      MongoDB database name (default "weblay-central", env WEBLAY_DB)
  -base string    Public base URL of this server, e.g. https://edit.example.com (env WEBLAY_BASE_URL)
  -crawl int      Drift crawler interval in minutes (default 10, 0 = off, env WEBLAY_CRAWL)
`)
}

func serve(args []string) error {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	addr := fs.String("addr", envOr("WEBLAY_ADDR", ":8787"), "listen address")
	dataDir := fs.String("data", envOr("WEBLAY_DATA", "./weblay-data"), "data directory")
	dsn := fs.String("dsn", os.Getenv("WEBLAY_DSN"), "database DSN (postgres or mongodb; empty = SQLite)")
	dbName := fs.String("db", os.Getenv("WEBLAY_DB"), "MongoDB database name (default weblay-central)")
	baseURL := fs.String("base", os.Getenv("WEBLAY_BASE_URL"), "public base URL")
	superAdmin := fs.String("super-admin", os.Getenv("WEBLAY_SUPER_ADMIN"), "super-admin email (default sathnidukottage@gmail.com)")
	// Drift detection runs by default so edits are checked without any manual
	// step; set WEBLAY_CRAWL=0 to disable the background crawler.
	crawlMin := fs.Int("crawl", envInt("WEBLAY_CRAWL", 10), "drift crawler interval (minutes; 0 = off)")
	if err := fs.Parse(args); err != nil {
		return err
	}

	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	cfg, err := config.Load(config.Options{
		Addr:          *addr,
		DataDir:       *dataDir,
		DSN:             *dsn,
		DBName:          *dbName,
		BaseURL:         *baseURL,
		SuperAdminEmail: *superAdmin,
		DriftInterval:   time.Duration(*crawlMin) * time.Minute,
	})
	if err != nil {
		return err
	}

	st, err := store.Open(cfg)
	if err != nil {
		return fmt.Errorf("open store: %w", err)
	}
	defer st.Close()

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           httpapi.New(cfg, st, logger, version),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("weblay listening", "addr", cfg.Addr, "db", st.Kind(), "data", cfg.DataDir)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-errCh:
		return err
	case <-stop:
		logger.Info("shutting down")
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		return srv.Shutdown(ctx)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
