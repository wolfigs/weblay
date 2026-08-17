// Package httpapi wires the Weblay HTTP surface: dashboard API (cookie auth),
// edit-mode API (bearer tokens, CORS), public manifests, uploads, and the
// embedded admin UI.
package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/wolfigs/weblay/internal/config"
	"github.com/wolfigs/weblay/internal/drift"
	"github.com/wolfigs/weblay/internal/store"
)

// Server carries shared dependencies for all handlers.
type Server struct {
	cfg     *config.Config
	st      store.Store
	log     *slog.Logger
	version string
	limiter *rateLimiter
	metrics *metrics
	mailer  Mailer

	// crawlMu guards lastCrawl, a per-site debounce for on-demand crawls
	// triggered by the deploy webhook and runtime telemetry, so a burst of
	// triggers coalesces into at most one crawl per crawlCooldown.
	crawlMu   sync.Mutex
	lastCrawl map[string]time.Time
}

// crawlCooldown bounds how often event-driven triggers (webhook, telemetry) may
// launch a crawl for one site. The scheduled background crawler is separate.
const crawlCooldown = 45 * time.Second

// New builds the root handler.
func New(cfg *config.Config, st store.Store, log *slog.Logger, version string) http.Handler {
	s := &Server{cfg: cfg, st: st, log: log, version: version, limiter: newRateLimiter(), metrics: newMetrics(), mailer: logMailer{log: log}, lastCrawl: map[string]time.Time{}}

	mux := http.NewServeMux()

	// Public: published manifests + uploaded assets. CORS: any origin, GET only.
	mux.HandleFunc("GET /m/{siteKey}/manifest.json", s.publicCORS(s.handleManifest))
	mux.HandleFunc("GET /a/{assetID}/{filename}", s.publicCORS(s.handleAssetServe))
	mux.HandleFunc("GET /p/{siteKey}/manifest.json", s.publicCORS(s.handlePreviewManifest))
	// Public: runtime drift telemetry (visitor beacons).
	mux.HandleFunc("POST /t/{siteKey}", s.handleTelemetry)
	mux.HandleFunc("OPTIONS /t/{siteKey}", s.handleTelemetryPreflight)
	// Deploy webhook: CI calls this on publish to re-crawl immediately.
	mux.HandleFunc("POST /hooks/{siteKey}/recrawl", s.rateLimit(s.handleDeployWebhook))

	// Dashboard auth (session cookies, same-origin).
	mux.HandleFunc("GET /api/v1/status", s.handleStatus)
	mux.HandleFunc("POST /api/v1/auth/setup", s.rateLimit(s.handleSetup))
	mux.HandleFunc("POST /api/v1/auth/login", s.rateLimit(s.handleLogin))
	mux.HandleFunc("POST /api/v1/auth/logout", s.handleLogout)
	mux.HandleFunc("POST /api/v1/auth/forgot", s.rateLimit(s.handleForgotPassword))
	mux.HandleFunc("POST /api/v1/auth/reset", s.rateLimit(s.handleResetPassword))
	mux.HandleFunc("POST /api/v1/auth/verify-email", s.rateLimit(s.handleVerifyEmail))
	mux.HandleFunc("GET /api/v1/me", s.withUser(s.handleMe))

	// Account security: active sessions, 2FA, email verification.
	mux.HandleFunc("GET /api/v1/me/sessions", s.withUser(s.handleSessionsList))
	mux.HandleFunc("DELETE /api/v1/me/sessions/{sessionID}", s.withUser(s.handleSessionRevoke))
	mux.HandleFunc("POST /api/v1/me/sessions/revoke-others", s.withUser(s.handleSessionsRevokeOthers))
	mux.HandleFunc("POST /api/v1/me/2fa/setup", s.withUser(s.handleTOTPSetup))
	mux.HandleFunc("POST /api/v1/me/2fa/enable", s.withUser(s.handleTOTPEnable))
	mux.HandleFunc("POST /api/v1/me/2fa/disable", s.withUser(s.handleTOTPDisable))
	mux.HandleFunc("POST /api/v1/me/send-verification", s.withUser(s.handleSendVerification))

	// Wolfigs platform admin panel: super admin manages accounts + admin roles.
	mux.HandleFunc("GET /api/v1/admin/overview", s.withPermission(store.PermManageUsers, s.handleAdminOverview))
	mux.HandleFunc("GET /api/v1/admin/users", s.withPermission(store.PermManageUsers, s.handleAdminUsersList))
	mux.HandleFunc("POST /api/v1/admin/users", s.withPermission(store.PermManageUsers, s.handleAdminUserCreate))
	mux.HandleFunc("PATCH /api/v1/admin/users/{userID}", s.withSuperAdmin(s.handleAdminUserUpdate))
	mux.HandleFunc("DELETE /api/v1/admin/users/{userID}", s.withSuperAdmin(s.handleAdminUserDelete))

	// Dashboard: sites, origins, members, pages, revisions.
	mux.HandleFunc("GET /api/v1/sites", s.withUser(s.handleSitesList))
	mux.HandleFunc("POST /api/v1/sites", s.withUser(s.handleSiteCreate))
	mux.HandleFunc("GET /api/v1/sites/{siteID}", s.withSite(s.handleSiteGet))
	mux.HandleFunc("DELETE /api/v1/sites/{siteID}", s.withSite(s.handleSiteDelete))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/origins", s.withSite(s.handleOriginAdd))
	mux.HandleFunc("DELETE /api/v1/sites/{siteID}/origins", s.withSite(s.handleOriginRemove))
	mux.HandleFunc("GET /api/v1/sites/{siteID}/members", s.withSite(s.handleMembersList))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/members", s.withSite(s.handleMemberAdd))
	mux.HandleFunc("GET /api/v1/sites/{siteID}/health", s.withSite(s.handleSiteHealth))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/health/scan", s.withSite(s.handleSiteHealthScan))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/verify-install", s.withSite(s.handleSiteVerifyInstall))
	mux.HandleFunc("GET /api/v1/sites/{siteID}/webhook", s.withSite(s.handleWebhookGet))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/webhook/rotate", s.withSite(s.handleWebhookRotate))
	mux.HandleFunc("GET /api/v1/sites/{siteID}/pages", s.withSite(s.handlePagesList))
	mux.HandleFunc("GET /api/v1/sites/{siteID}/pages/{pageID}/revisions", s.withSite(s.handleRevisionsList))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/pages/{pageID}/publish", s.withSite(s.handlePagePublish))
	mux.HandleFunc("GET /api/v1/sites/{siteID}/reviews", s.withSite(s.handlePendingReviews))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/pages/{pageID}/approve", s.withSite(s.handlePageApprove))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/pages/{pageID}/reject", s.withSite(s.handlePageReject))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/pages/{pageID}/preview-link", s.withSite(s.handlePreviewLinkCreate))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/pages/{pageID}/discard", s.withSite(s.handlePageDiscard))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/pages/{pageID}/reset", s.withSite(s.handlePageReset))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/pages/{pageID}/reset-element", s.withSite(s.handlePageResetElement))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/reset", s.withSite(s.handleSiteReset))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/revisions/{revisionID}/restore", s.withSite(s.handleRevisionRestore))
	mux.HandleFunc("POST /api/v1/sites/{siteID}/edit-token", s.withSite(s.handleEditTokenIssue))

	// Edit mode (bearer token from the on-site editor; CORS per site origins).
	mux.HandleFunc("OPTIONS /api/v1/edit/{rest...}", s.handleEditPreflight)
	mux.HandleFunc("GET /api/v1/edit/session", s.withEditGrant(s.handleEditSession))
	mux.HandleFunc("GET /api/v1/edit/content", s.withEditGrant(s.handleEditContentGet))
	mux.HandleFunc("PUT /api/v1/edit/content", s.withEditGrant(s.rateLimitSite(rateDraftMax, s.handleEditContentPut)))
	mux.HandleFunc("DELETE /api/v1/edit/content", s.withEditGrant(s.handleEditContentDelete))
	mux.HandleFunc("POST /api/v1/edit/publish", s.withEditGrant(s.handleEditPublish))
	mux.HandleFunc("POST /api/v1/edit/discard", s.withEditGrant(s.handleEditDiscard))
	mux.HandleFunc("POST /api/v1/edit/reset-element", s.withEditGrant(s.handleEditResetElement))
	mux.HandleFunc("POST /api/v1/edit/upload", s.withEditGrant(s.rateLimitSite(rateUploadMax, s.handleEditUpload)))
	mux.HandleFunc("GET /api/v1/edit/revisions", s.withEditGrant(s.handleEditRevisionsList))
	mux.HandleFunc("GET /api/v1/edit/revisions/{revisionID}", s.withEditGrant(s.handleEditRevisionGet))
	mux.HandleFunc("POST /api/v1/edit/revisions/{revisionID}/restore-draft", s.withEditGrant(s.handleEditRevisionRestoreDraft))

	// Embedded admin dashboard + connector script at the root.
	s.mountAdmin(mux)

	// Guarantee the configured Wolfigs super admin always holds full control
	// (best-effort; a fresh install has no accounts yet and setup creates it).
	if cfg.SuperAdminEmail != "" {
		if promoted, err := st.EnsureSuperAdmin(context.Background(), cfg.SuperAdminEmail); err != nil {
			log.Warn("super-admin bootstrap failed", "email", cfg.SuperAdminEmail, "err", err)
		} else if promoted {
			log.Info("promoted account to super admin", "email", cfg.SuperAdminEmail)
		}
	}

	go s.pruneLoop()
	if cfg.DriftInterval > 0 {
		go s.driftLoop()
	}

	return s.securityHeaders(s.instrument(mux))
}

// triggerCrawl launches a background crawl of one site unless a recent trigger
// already did (debounced by crawlCooldown). It returns immediately; the crawl
// runs in its own goroutine so callers (webhook, telemetry beacon) never block.
// The scheduled driftLoop remains the always-on fallback.
func (s *Server) triggerCrawl(siteID string) {
	s.crawlMu.Lock()
	if t, ok := s.lastCrawl[siteID]; ok && time.Since(t) < crawlCooldown {
		s.crawlMu.Unlock()
		return
	}
	s.lastCrawl[siteID] = time.Now()
	s.crawlMu.Unlock()

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		site, err := s.st.SiteByID(ctx, siteID)
		if err != nil {
			return
		}
		if _, err := drift.New(s.st, s.log).CrawlSite(ctx, site); err != nil {
			s.log.Warn("triggered crawl", "site", siteID, "err", err)
		}
	}()
}

// driftLoop periodically re-anchors every site's bindings against live HTML —
// the continuous safety net that catches drift even without a deploy webhook.
func (s *Server) driftLoop() {
	c := drift.New(s.st, s.log)
	t := time.NewTicker(s.cfg.DriftInterval)
	defer t.Stop()
	for range t.C {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		ids, err := s.st.AllSiteIDs(ctx)
		if err != nil {
			s.log.Error("drift crawl: list sites", "err", err)
			cancel()
			continue
		}
		for _, id := range ids {
			site, err := s.st.SiteByID(ctx, id)
			if err != nil {
				continue
			}
			if _, err := c.CrawlSite(ctx, site); err != nil {
				s.log.Warn("drift crawl site", "site", id, "err", err)
			}
		}
		cancel()
	}
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
