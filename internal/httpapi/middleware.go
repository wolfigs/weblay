package httpapi

import (
	"context"
	"crypto/subtle"
	"errors"
	"net"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/wolfigs/weblay/internal/store"
)

func sessionIDFrom(r *http.Request) string {
	if v, ok := r.Context().Value(ctxSessionID).(string); ok {
		return v
	}
	return ""
}

type ctxKey int

const (
	ctxUser ctxKey = iota
	ctxSite
	ctxGrant
	ctxSessionID
)

const (
	sessionCookie = "weblay_session"
	csrfCookie    = "weblay_csrf"
	csrfHeader    = "X-CSRF-Token"
)

// safeMethod reports whether an HTTP method is non-mutating (and thus exempt
// from CSRF checks).
func safeMethod(m string) bool {
	return m == http.MethodGet || m == http.MethodHead || m == http.MethodOptions
}

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

// withUser requires a valid dashboard session cookie, and enforces CSRF
// (double-submit token) on state-changing requests.
func (s *Server) withUser(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(sessionCookie)
		if err != nil || c.Value == "" {
			writeError(w, http.StatusUnauthorized, "not signed in")
			return
		}
		if !safeMethod(r.Method) && !s.csrfOK(r) {
			writeError(w, http.StatusForbidden, "invalid or missing CSRF token")
			return
		}
		sessionID := store.HashToken(c.Value)
		u, err := s.st.UserBySession(r.Context(), sessionID)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "session expired")
			return
		}
		ctx := context.WithValue(r.Context(), ctxUser, u)
		ctx = context.WithValue(ctx, ctxSessionID, sessionID)
		next(w, r.WithContext(ctx))
	}
}

// csrfOK validates the double-submit token: the X-CSRF-Token header must match
// the readable CSRF cookie. A cross-site attacker can set neither.
func (s *Server) csrfOK(r *http.Request) bool {
	cookie, err := r.Cookie(csrfCookie)
	if err != nil || cookie.Value == "" {
		return false
	}
	header := r.Header.Get(csrfHeader)
	return header != "" && subtle.ConstantTimeCompare([]byte(header), []byte(cookie.Value)) == 1
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
		// Platform admins with site oversight can open any site, even without
		// membership — this is what powers the admin panel's website management.
		if !ok && !u.Can(store.PermManageSites) {
			writeError(w, http.StatusForbidden, "not a member of this site")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), ctxSite, site)))
	})
}

// withSuperAdmin requires the caller to be the Wolfigs super admin.
func (s *Server) withSuperAdmin(next http.HandlerFunc) http.HandlerFunc {
	return s.withUser(func(w http.ResponseWriter, r *http.Request) {
		if !userFrom(r).IsSuperAdmin() {
			writeError(w, http.StatusForbidden, "super-admin access required")
			return
		}
		next(w, r)
	})
}

// withPermission requires the caller to hold a specific platform permission (the
// super admin passes every check).
func (s *Server) withPermission(perm string, next http.HandlerFunc) http.HandlerFunc {
	return s.withUser(func(w http.ResponseWriter, r *http.Request) {
		if !userFrom(r).Can(perm) {
			writeError(w, http.StatusForbidden, "insufficient permissions")
			return
		}
		next(w, r)
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
	return rl.allowN("ip:"+ip, rateMax, rateWindow)
}

// allowN is a fixed-window limiter for an arbitrary key (per-IP, per-site, …)
// with a caller-chosen ceiling and window. Returns false once the key exceeds
// max requests within the current window.
func (rl *rateLimiter) allowN(key string, max int, dur time.Duration) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	wdw, ok := rl.windows[key]
	if !ok || now.Sub(wdw.start) > dur {
		// Opportunistically drop stale windows so the map doesn't grow forever.
		if len(rl.windows) > 10000 {
			for k, v := range rl.windows {
				if now.Sub(v.start) > rateWindow {
					delete(rl.windows, k)
				}
			}
		}
		rl.windows[key] = &window{start: now, count: 1}
		return true
	}
	wdw.count++
	return wdw.count <= max
}

// Per-site write ceilings (fixed window = rateWindow). Draft saves are chatty
// (debounced keystrokes), so that ceiling is generous; uploads are heavier.
const (
	rateDraftMax  = 300 // draft content saves per site per minute
	rateUploadMax = 60  // asset uploads per site per minute
)

// rateLimitSite throttles per site. Compose it INSIDE withEditGrant/withSite so
// the site is already in the request context.
func (s *Server) rateLimitSite(max int, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.limiter.allowN("site:"+siteFrom(r).ID, max, rateWindow) {
			writeError(w, http.StatusTooManyRequests, "too many requests for this site, slow down")
			return
		}
		next(w, r)
	}
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
