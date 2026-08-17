package httpapi

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/wolfigs/weblay/internal/store"
)

const previewTokenTTL = 7 * 24 * time.Hour

// canPublish reports whether a user may publish a site directly (vs. having to
// submit for review). Site owners and platform admins can; plain editors cannot.
func (s *Server) canPublish(r *http.Request, siteID, userID string) bool {
	if u := userFrom(r); u != nil && u.IsAdmin() {
		return true
	}
	role, err := s.st.MemberRole(r.Context(), siteID, userID)
	return err == nil && role == "owner"
}

// canPublishGrant is the edit-token variant (no dashboard user in context).
func (s *Server) canPublishGrant(r *http.Request, siteID, userID string) bool {
	if u, err := s.st.UserByID(r.Context(), userID); err == nil && u.IsAdmin() {
		return true
	}
	role, err := s.st.MemberRole(r.Context(), siteID, userID)
	return err == nil && role == "owner"
}

// handlePagePendingReviews lists pages awaiting approval (dashboard).
func (s *Server) handlePendingReviews(w http.ResponseWriter, r *http.Request) {
	reviews, err := s.st.PendingReviews(r.Context(), siteFrom(r).ID)
	if err != nil {
		s.internalError(w, err)
		return
	}
	if reviews == nil {
		reviews = []*store.PendingReview{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"reviews": reviews})
}

// handlePageApprove publishes a page under review and clears the request. Owner
// or platform-admin only (enforced by the route + this check).
func (s *Server) handlePageApprove(w http.ResponseWriter, r *http.Request) {
	page, ok := s.pageInSite(w, r)
	if !ok {
		return
	}
	if !s.canPublish(r, page.SiteID, userFrom(r).ID) {
		writeError(w, http.StatusForbidden, "only a site owner or admin can approve")
		return
	}
	rev, err := s.st.PublishPage(r.Context(), page.ID, userFrom(r).ID)
	if err != nil {
		s.internalError(w, err)
		return
	}
	_ = s.st.ClearReview(r.Context(), page.ID)
	s.triggerCrawl(page.SiteID)
	writeJSON(w, http.StatusOK, map[string]any{"version": rev.Version, "publishedAt": rev.PublishedAt})
}

// handlePageReject clears a pending review without publishing.
func (s *Server) handlePageReject(w http.ResponseWriter, r *http.Request) {
	page, ok := s.pageInSite(w, r)
	if !ok {
		return
	}
	if !s.canPublish(r, page.SiteID, userFrom(r).ID) {
		writeError(w, http.StatusForbidden, "only a site owner or admin can reject")
		return
	}
	if err := s.st.ClearReview(r.Context(), page.ID); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "review dismissed"})
}

// --- Preview links ---

// handlePreviewLinkCreate mints a shareable link that renders a page's current
// (unpublished) draft, for stakeholders without edit access.
func (s *Server) handlePreviewLinkCreate(w http.ResponseWriter, r *http.Request) {
	page, ok := s.pageInSite(w, r)
	if !ok {
		return
	}
	token, hash := store.NewToken()
	expires := time.Now().UTC().Add(previewTokenTTL)
	if err := s.st.CreatePreviewToken(r.Context(), hash, page.SiteID, page.Path, userFrom(r).ID, expires); err != nil {
		s.internalError(w, err)
		return
	}
	site := siteFrom(r)
	url := fmt.Sprintf("%s/p/%s/manifest.json?path=%s&token=%s",
		s.assetBase(r), site.SiteKey, page.Path, token)
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "url": url, "expiresAt": expires})
}

// handlePreviewManifest serves a page's DRAFT manifest when a valid preview
// token is presented — the public read side of a preview link. CORS-open so it
// can be fetched from the customer's own origin.
func (s *Server) handlePreviewManifest(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		writeError(w, http.StatusUnauthorized, "preview token required")
		return
	}
	siteID, tokenPath, err := s.st.PreviewToken(r.Context(), store.HashToken(token))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusForbidden, "invalid or expired preview link")
		return
	}
	if err != nil {
		s.internalError(w, err)
		return
	}

	site, err := s.st.SiteByKey(r.Context(), r.PathValue("siteKey"))
	if err != nil || site.ID != siteID {
		writeError(w, http.StatusForbidden, "preview token does not match this site")
		return
	}
	path := normalizePath(r.URL.Query().Get("path"))
	if path != tokenPath {
		writeError(w, http.StatusForbidden, "preview token is scoped to a different page")
		return
	}

	manifest := &store.Manifest{Version: 0, Elements: map[string]*store.ElementContent{}}
	if page, err := s.st.PageByPath(r.Context(), siteID, path); err == nil {
		if manifest, err = s.st.DraftManifest(r.Context(), page.ID); err != nil {
			s.internalError(w, err)
			return
		}
	}
	body, err := json.Marshal(manifest)
	if err != nil {
		s.internalError(w, err)
		return
	}
	etag := fmt.Sprintf(`"%x"`, sha256.Sum256(body))
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "no-store") // drafts change constantly
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Write(body)
}
