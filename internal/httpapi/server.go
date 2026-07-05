// Package httpapi wires the Inlay HTTP surface: dashboard API (cookie auth),
// edit-mode API (bearer tokens, CORS), public manifests, uploads, and the
// embedded admin UI.
package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/wolfigs/inlay/internal/config"
	"github.com/wolfigs/inlay/internal/store"
)

// Server carries shared dependencies for all handlers.
type Server struct {
	cfg     *config.Config
	st      *store.Store
	log     *slog.Logger
	version string
	limiter *rateLimiter
}

// New builds the root handler.
func New(cfg *config.Config, st *store.Store, log *slog.Logger, version string) http.Handler {
	s := &Server{cfg: cfg, st: st, log: log, version: version, limiter: newRateLimiter()}

	mux := http.NewServeMux()

	// Public: published manifests + uploaded assets. CORS: any origin, GET only.
	mux.HandleFunc("GET /m/{siteKey}/manifest.json", s.publicCORS(s.handleManifest))
	mux.HandleFunc("GET /a/{assetID}/{filename}", s.publicCORS(s.handleAssetServe))

	// Dashboard auth (session cookies, same-origin).
	mux.HandleFunc("GET /api/v1/status", s.handleStatus)
	mux.HandleFunc("POST /api/v1/auth/setup", s.rateLimit(s.handleSetup))
	mux.HandleFunc("POST /api/v1/auth/login", s.rateLimit(s.handleLogin))
	mux.HandleFunc("POST /api/v1/auth/logout", s.handleLogout)
	mux.HandleFunc("GET /api/v1/me", s.withUser(s.handleMe))

	// Dashboard: sites, origins, members, pages, revisions.
	mux.HandleFunc("GET /api/v1/sites", s.withUser(s.handleSitesList))
	mux.HandleFunc("POST /api/v1/sites", s.withUser(s.handleSiteCreate))
	mux.HandleFunc("GET /api/v1/sites/{siteID}", s.withSite(s.handleSiteGet))
	mux.HandleFunc("DELETE /api/v1/sites/{siteID}", s.withSite(s.handleSiteDelete))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/origins", s.withSite(s.handleOriginAdd))
	mux.HandleFunc("DELETE /api/v1/sites/{siteID}/origins", s.withSite(s.handleOriginRemove))
	mux.HandleFunc("GET /api/v1/sites/{siteID}/members", s.withSite(s.handleMembersList))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/members", s.withSite(s.handleMemberAdd))
	mux.HandleFunc("GET /api/v1/sites/{siteID}/pages", s.withSite(s.handlePagesList))
	mux.HandleFunc("GET /api/v1/sites/{siteID}/pages/{pageID}/revisions", s.withSite(s.handleRevisionsList))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/revisions/{revisionID}/restore", s.withSite(s.handleRevisionRestore))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/edit-token", s.withSite(s.handleEditTokenIssue))

	// Edit mode (bearer token from the on-site editor; CORS per site origins).
	mux.HandleFunc("OPTIONS /api/v1/edit/{rest...}", s.handleEditPreflight)
	mux.HandleFunc("GET /api/v1/edit/session", s.withEditGrant(s.handleEditSession))
	mux.HandleFunc("GET /api/v1/edit/content", s.withEditGrant(s.handleEditContentGet))
	mux.HandleFunc("PUT /api/v1/edit/content", s.withEditGrant(s.handleEditContentPut))
	mux.HandleFunc("DELETE /api/v1/edit/content", s.withEditGrant(s.handleEditContentDelete))
	mux.HandleFunc("POST /api/v1/edit/publish", s.withEditGrant(s.handleEditPublish))
	mux.HandleFunc("POST /api/v1/edit/upload", s.withEditGrant(s.handleEditUpload))

	// Embedded admin dashboard + connector script at the root.
	s.mountAdmin(mux)

	go s.pruneLoop()

	return s.securityHeaders(mux)
}

// pruneLoop clears expired sessions and edit tokens hourly.
func (s *Server) pruneLoop() {
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for range t.C {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		if err := s.st.PruneExpired(ctx); err != nil {
			s.log.Error("prune expired", "err", err)
		}
		cancel()
	}
}
