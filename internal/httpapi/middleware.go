package httpapi

import (
	"context"
	"errors"
	"net"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/wolfigs/weblay/internal/store"
)

type ctxKey int

const (
	ctxUser ctxKey = iota
	ctxSite
	ctxGrant
)

const sessionCookie = "weblay_session"

// securityHeaders applies baseline hardening to every response.
func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		next.ServeHTTP(w, r)
	})
}

// publicCORS allows any origin to GET public resources (manifests, assets).
func (s *Server) publicCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		next(w, r)
	}
}

// withUser requires a valid dashboard session cookie.
func (s *Server) withUser(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(sessionCookie)
		if err != nil || c.Value == "" {
			writeError(w, http.StatusUnauthorized, "not signed in")
			return
		}
		u, err := s.st.UserBySession(r.Context(), store.HashToken(c.Value))
		if err != nil {
			writeError(w, http.StatusUnauthorized, "session expired")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), ctxUser, u)))
	}
}

// withSite requires a session and membership of the {siteID} path parameter.
func (s *Server) withSite(next http.HandlerFunc) http.HandlerFunc {
	return s.withUser(func(w http.ResponseWriter, r *http.Request) {
		u := userFrom(r)
		site, err := s.st.SiteByID(r.Context(), r.PathValue("siteID"))
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "site not found")
			return
		}
		if err != nil {
			s.internalError(w, err)
			return
		}
		ok, err := s.st.IsMember(r.Context(), site.ID, u.ID)
		if err != nil {
			s.internalError(w, err)
			return
		}
		if !ok {
			writeError(w, http.StatusForbidden, "not a member of this site")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), ctxSite, site)))
	})
}

// withEditGrant requires a bearer edit token and applies per-site CORS so the
// editor can call the API from the customer's own origin.
func (s *Server) withEditGrant(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || token == "" {
			writeError(w, http.StatusUnauthorized, "missing edit token")
			return
		}
		grant, err := s.st.EditGrantByToken(r.Context(), store.HashToken(token))
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid or expired edit token")
			return
		}
		site, err := s.st.SiteByID(r.Context(), grant.SiteID)
		if err != nil {
			s.internalError(w, err)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" {
			if !slices.Contains(site.Origins, origin) {
				writeError(w, http.StatusForbidden, "origin not allowed for this site")
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		ctx := context.WithValue(r.Context(), ctxGrant, grant)
		ctx = context.WithValue(ctx, ctxSite, site)
		next(w, r.WithContext(ctx))
	}
}

// handleEditPreflight answers CORS preflights for the edit API. The origin is
// echoed for any registered origin across sites; real authorization happens
// on the actual request via the bearer token.
func (s *Server) handleEditPreflight(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
	w.Header().Set("Access-Control-Max-Age", "600")
	w.Header().Set("Vary", "Origin")
	w.WriteHeader(http.StatusNoContent)
}

func userFrom(r *http.Request) *store.User    { return r.Context().Value(ctxUser).(*store.User) }
func siteFrom(r *http.Request) *store.Site    { return r.Context().Value(ctxSite).(*store.Site) }
func grantFrom(r *http.Request) *store.EditGrant {
	return r.Context().Value(ctxGrant).(*store.EditGrant)
}

// --- Rate limiting: fixed-window per IP, for credential endpoints ---

type rateLimiter struct {
	mu      sync.Mutex
	windows map[string]*window
}

type window struct {
	start time.Time
	count int
}

const (
	rateWindow = time.Minute
	rateMax    = 20
)

func newRateLimiter() *rateLimiter {
	return &rateLimiter{windows: map[string]*window{}}
}

func (rl *rateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	wdw, ok := rl.windows[ip]
	if !ok || now.Sub(wdw.start) > rateWindow {
		// Opportunistically drop stale windows so the map doesn't grow forever.
		if len(rl.windows) > 10000 {
			for k, v := range rl.windows {
				if now.Sub(v.start) > rateWindow {
					delete(rl.windows, k)
				}
			}
		}
		rl.windows[ip] = &window{start: now, count: 1}
		return true
	}
	wdw.count++
	return wdw.count <= rateMax
}

func (s *Server) rateLimit(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			ip = r.RemoteAddr
		}
		if !s.limiter.allow(ip) {
			writeError(w, http.StatusTooManyRequests, "too many attempts, slow down")
			return
		}
		next(w, r)
	}
}
