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
	"syscall"
	"time"

	"github.com/wolfigs/inlay/internal/config"
	"github.com/wolfigs/inlay/internal/httpapi"
	"github.com/wolfigs/inlay/internal/store"
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
			fmt.Fprintln(os.Stderr, "inlay:", err)
			os.Exit(1)
		}
	case "version":
		fmt.Println("inlay", version)
	case "help", "-h", "--help":
		usage()
	default:
		fmt.Fprintf(os.Stderr, "inlay: unknown command %q\n\n", os.Args[1])
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Print(`Inlay — visual in-place editing for any website.

Usage:
  inlay serve [flags]   Start the Inlay server
  inlay version         Print version

Flags for serve:
  -addr string    Listen address (default ":8787", env INLAY_ADDR)
  -data string    Data directory for SQLite DB and uploads (default "./inlay-data", env INLAY_DATA)
  -dsn string     Postgres DSN; when set, Postgres is used instead of SQLite (env INLAY_DSN)
  -base string    Public base URL of this server, e.g. https://edit.example.com (env INLAY_BASE_URL)
`)
}

func serve(args []string) error {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	addr := fs.String("addr", envOr("INLAY_ADDR", ":8787"), "listen address")
	dataDir := fs.String("data", envOr("INLAY_DATA", "./inlay-data"), "data directory")
	dsn := fs.String("dsn", os.Getenv("INLAY_DSN"), "postgres DSN (optional)")
	baseURL := fs.String("base", os.Getenv("INLAY_BASE_URL"), "public base URL")
	if err := fs.Parse(args); err != nil {
		return err
	}

	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	cfg, err := config.Load(config.Options{
		Addr:    *addr,
		DataDir: *dataDir,
		DSN:     *dsn,
		BaseURL: *baseURL,
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
		logger.Info("inlay listening", "addr", cfg.Addr, "db", st.Kind(), "data", cfg.DataDir)
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
