package httpapi

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/wolfigs/weblay/internal/drift"
	"github.com/wolfigs/weblay/internal/store"
)

const maxTelemetryResults = 500

// handleTelemetry is the public sink for runtime verification beacons
// (detection channel #3). It carries only structural selectors + state codes,
// never page content. Best-effort and non-authoritative.
func (s *Server) handleTelemetry(w http.ResponseWriter, r *http.Request) {
	// Public + cross-origin (called from customer sites, like the manifest).
	w.Header().Set("Access-Control-Allow-Origin", "*")
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)

	site, err := s.st.SiteByKey(r.Context(), r.PathValue("siteKey"))
	if err != nil {
		w.WriteHeader(http.StatusNoContent) // don't leak whether a key exists
		return
	}

	var body struct {
		Path    string                  `json:"path"`
		Results []store.TelemetryResult `json:"results"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if len(body.Results) == 0 {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if len(body.Results) > maxTelemetryResults {
		body.Results = body.Results[:maxTelemetryResults]
	}

	path := normalizePath(body.Path)
	page, err := s.st.PageByPath(r.Context(), site.ID, path)
	if errors.Is(err, store.ErrNotFound) {
		w.WriteHeader(http.StatusNoContent) // no page = nothing to attribute
		return
	}
	if err != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	_ = s.st.RecordTelemetry(r.Context(), site.ID, page.ID, path, body.Results)

	// Fix C: a real visitor reporting a missing/displaced/duplicate override is
	// live evidence of drift — trigger an authoritative crawl right away (debounced)
	// so detection happens in near-real-time rather than waiting for the interval.
	for _, res := range body.Results {
		if res.State == "missing" || res.State == "displaced" || res.State == "duplicate" {
			s.triggerCrawl(site.ID)
			break
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleTelemetryPreflight answers CORS preflight for the fetch fallback.
func (s *Server) handleTelemetryPreflight(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Max-Age", "86400")
	w.WriteHeader(http.StatusNoContent)
}

// handleSiteHealth returns drift-health for every override on a site, plus a
// summary count per status, for the dashboard's Override Health view.
func (s *Server) handleSiteHealth(w http.ResponseWriter, r *http.Request) {
	bindings, err := s.st.BindingHealthForSite(r.Context(), siteFrom(r).ID)
	if err != nil {
		s.internalError(w, err)
		return
	}
	if bindings == nil {
		bindings = []*store.BindingHealth{}
	}
	summary := map[string]int{
		store.StatusHealthy: 0, store.StatusAtRisk: 0, store.StatusBroken: 0, store.StatusQuarantined: 0,
	}
	for _, b := range bindings {
		summary[b.Status]++
	}
	writeJSON(w, http.StatusOK, map[string]any{"summary": summary, "bindings": bindings})
}

// handleSiteHealthScan runs the drift crawler for a site on demand (a manual
// "re-check now" from the dashboard) and returns the fresh health.
func (s *Server) handleSiteHealthScan(w http.ResponseWriter, r *http.Request) {
	site := siteFrom(r)
	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	if _, err := drift.New(s.st, s.log).CrawlSite(ctx, site); err != nil {
		s.internalError(w, err)
		return
	}
	s.handleSiteHealth(w, r)
}

// handleSiteVerifyInstall fetches a page from the site and reports whether the
// Weblay connector script is installed with the matching site key — the
// dashboard's "Verify installation" action. SSRF-safe: the target URL's origin
// must be one the site has registered (the same trust rule as the crawler).
func (s *Server) handleSiteVerifyInstall(w http.ResponseWriter, r *http.Request) {
	site := siteFrom(r)
	var body struct {
		URL string `json:"url"`
	}
	// Body is optional; default to the site's first registered origin.
	_ = readJSONOptional(r, &body)

	target := strings.TrimSpace(body.URL)
	if target == "" {
		if len(site.Origins) == 0 {
			writeError(w, http.StatusBadRequest, "add your site URL first, then verify")
			return
		}
		target = site.Origins[0]
	}
	if !s.originAllowed(site, target) {
		writeError(w, http.StatusBadRequest, "that URL is not one of this site's registered origins")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	rep := drift.CheckInstall(ctx, drift.New(s.st, s.log).Client, target, site.SiteKey)
	writeJSON(w, http.StatusOK, rep)
}

// webhookURL builds the absolute deploy-webhook URL for a site key.
func (s *Server) webhookURL(r *http.Request, siteKey string) string {
	return s.assetBase(r) + "/hooks/" + siteKey + "/recrawl"
}

// handleWebhookGet returns the deploy-webhook URL, secret, and an example curl.
// Lazily generates a secret for sites created before the feature existed.
func (s *Server) handleWebhookGet(w http.ResponseWriter, r *http.Request) {
	site := siteFrom(r)
	if site.WebhookSecret == "" {
		secret, err := s.st.RotateWebhookSecret(r.Context(), site.ID)
		if err != nil {
			s.internalError(w, err)
			return
		}
		site.WebhookSecret = secret
	}
	url := s.webhookURL(r, site.SiteKey)
	writeJSON(w, http.StatusOK, map[string]any{
		"url":     url,
		"secret":  site.WebhookSecret,
		"example": "curl -X POST " + url + " -H 'Authorization: Bearer " + site.WebhookSecret + "'",
	})
}

// handleWebhookRotate issues a fresh webhook secret (invalidating the old one).
func (s *Server) handleWebhookRotate(w http.ResponseWriter, r *http.Request) {
	site := siteFrom(r)
	secret, err := s.st.RotateWebhookSecret(r.Context(), site.ID)
	if err != nil {
		s.internalError(w, err)
		return
	}
	url := s.webhookURL(r, site.SiteKey)
	writeJSON(w, http.StatusOK, map[string]any{
		"url":     url,
		"secret":  secret,
		"example": "curl -X POST " + url + " -H 'Authorization: Bearer " + secret + "'",
	})
}

// handleDeployWebhook lets CI trigger an immediate re-crawl on deploy, turning
// the up-to-10-minute background interval into seconds exactly when markup
// changes. Authenticated by the per-site webhook secret; the crawl runs in the
// background (debounced) so CI gets an instant 202.
func (s *Server) handleDeployWebhook(w http.ResponseWriter, r *http.Request) {
	site, err := s.st.SiteByKey(r.Context(), r.PathValue("siteKey"))
	if err != nil {
		// Don't reveal whether a key exists.
		writeError(w, http.StatusUnauthorized, "invalid site or secret")
		return
	}
	secret := bearerToken(r)
	if secret == "" {
		// Also accept the secret in the body for webhook systems that can't set headers.
		var body struct {
			Secret string `json:"secret"`
		}
		_ = readJSONOptional(r, &body)
		secret = body.Secret
	}
	if site.WebhookSecret == "" || subtle.ConstantTimeCompare([]byte(secret), []byte(site.WebhookSecret)) != 1 {
		writeError(w, http.StatusUnauthorized, "invalid site or secret")
		return
	}
	s.triggerCrawl(site.ID)
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "recrawl queued"})
}

// bearerToken extracts a bearer token from the Authorization header, if present.
func bearerToken(r *http.Request) string {
	if t, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); ok {
		return strings.TrimSpace(t)
	}
	return ""
}

// originAllowed reports whether a full URL's scheme://host[:port] matches one of
// the site's registered origins, so verification can only fetch origins the
// developer controls.
func (s *Server) originAllowed(site *store.Site, rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil || u.Host == "" {
		return false
	}
	target := u.Scheme + "://" + u.Host
	for _, o := range site.Origins {
		if strings.EqualFold(strings.TrimRight(o, "/"), target) {
			return true
		}
	}
	return false
}
