package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/wolfigs/weblay/internal/store"
)

func (s *Server) handleSitesList(w http.ResponseWriter, r *http.Request) {
	sites, err := s.st.SitesForUser(r.Context(), userFrom(r).ID)
	if err != nil {
		s.internalError(w, err)
		return
	}
	if sites == nil {
		sites = []*store.Site{}
	}
	// Attach per-site health-issue counts so the home cards can flag alerts.
	ids := make([]string, len(sites))
	for i, st := range sites {
		ids[i] = st.ID
	}
	issues, _ := s.st.IssueCountsForSites(r.Context(), ids)
	out := make([]map[string]any, len(sites))
	for i, st := range sites {
		out[i] = map[string]any{
			"id": st.ID, "siteKey": st.SiteKey, "name": st.Name, "createdBy": st.CreatedBy,
			"createdAt": st.CreatedAt, "origins": st.Origins, "issues": issues[st.ID],
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleSiteCreate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name   string `json:"name"`
		Origin string `json:"origin"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "site name required")
		return
	}
	site := &store.Site{
		ID:        store.NewID(),
		SiteKey:   store.NewSiteKey(),
		Name:      body.Name,
		CreatedBy: userFrom(r).ID,
		CreatedAt: time.Now().UTC(),
	}
	if err := s.st.CreateSite(r.Context(), site); err != nil {
		s.internalError(w, err)
		return
	}
	if body.Origin != "" {
		if !validOrigin(body.Origin) {
			writeError(w, http.StatusBadRequest, "origin must look like https://example.com")
			return
		}
		if err := s.st.AddOrigin(r.Context(), site.ID, body.Origin); err != nil {
			s.internalError(w, err)
			return
		}
		site.Origins = []string{body.Origin}
	}
	writeJSON(w, http.StatusCreated, site)
}

func (s *Server) handleSiteGet(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, siteFrom(r))
}

func (s *Server) handleSiteDelete(w http.ResponseWriter, r *http.Request) {
	site := siteFrom(r)
	if site.CreatedBy != userFrom(r).ID {
		writeError(w, http.StatusForbidden, "only the site owner can delete it")
		return
	}
	if err := s.st.DeleteSite(r.Context(), site.ID); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleOriginAdd(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Origin string `json:"origin"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	body.Origin = strings.TrimRight(strings.TrimSpace(body.Origin), "/")
	if !validOrigin(body.Origin) {
		writeError(w, http.StatusBadRequest, "origin must look like https://example.com")
		return
	}
	if err := s.st.AddOrigin(r.Context(), siteFrom(r).ID, body.Origin); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"origin": body.Origin})
}

func (s *Server) handleOriginRemove(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Origin string `json:"origin"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if err := s.st.RemoveOrigin(r.Context(), siteFrom(r).ID, body.Origin); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}

func (s *Server) handleMembersList(w http.ResponseWriter, r *http.Request) {
	members, err := s.st.MembersForSite(r.Context(), siteFrom(r).ID)
	if err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, members)
}

func (s *Server) handleMemberAdd(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if body.Role == "" {
		body.Role = "editor"
	}
	if body.Role != "editor" && body.Role != "owner" {
		writeError(w, http.StatusBadRequest, "role must be editor or owner")
		return
	}
	u, err := s.st.UserByEmail(r.Context(), body.Email)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "no account with that email — they need to sign up first")
		return
	}
	if err != nil {
		s.internalError(w, err)
		return
	}
	if err := s.st.AddMember(r.Context(), siteFrom(r).ID, u.ID, body.Role); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"status": "added"})
}

func (s *Server) handlePagesList(w http.ResponseWriter, r *http.Request) {
	pages, err := s.st.PagesForSite(r.Context(), siteFrom(r).ID)
	if err != nil {
		s.internalError(w, err)
		return
	}
	if pages == nil {
		pages = []*store.Page{}
	}
	writeJSON(w, http.StatusOK, pages)
}

func (s *Server) handleRevisionsList(w http.ResponseWriter, r *http.Request) {
	page, err := s.st.PageByID(r.Context(), r.PathValue("pageID"))
	if errors.Is(err, store.ErrNotFound) || (err == nil && page.SiteID != siteFrom(r).ID) {
		writeError(w, http.StatusNotFound, "page not found")
		return
	}
	if err != nil {
		s.internalError(w, err)
		return
	}
	revs, err := s.st.RevisionsForPage(r.Context(), page.ID)
	if err != nil {
		s.internalError(w, err)
		return
	}
	if revs == nil {
		revs = []*store.Revision{}
	}
	writeJSON(w, http.StatusOK, revs)
}

// pageInSite loads the {pageID} path value and confirms it belongs to the
// granted site, writing a 404 and returning ok=false otherwise.
func (s *Server) pageInSite(w http.ResponseWriter, r *http.Request) (*store.Page, bool) {
	page, err := s.st.PageByID(r.Context(), r.PathValue("pageID"))
	if errors.Is(err, store.ErrNotFound) || (err == nil && page.SiteID != siteFrom(r).ID) {
		writeError(w, http.StatusNotFound, "page not found")
		return nil, false
	}
	if err != nil {
		s.internalError(w, err)
		return nil, false
	}
	return page, true
}

// resetPage removes every override on a page and republishes, reverting it to
// original markup live. Shared by the page + site reset handlers.
func (s *Server) resetPage(r *http.Request, pageID, userID string) error {
	elems, err := s.st.ElementsForPage(r.Context(), pageID)
	if err != nil {
		return err
	}
	for _, e := range elems {
		if err := s.st.DeleteElement(r.Context(), pageID, e.Selector); err != nil {
			return err
		}
	}
	// Wipe ALL health rows for the page — including orphans left by telemetry or
	// legacy seeds that no longer map to a live override — so reset truly clears
	// the health board rather than leaving stale alarms behind.
	_ = s.st.DeleteBindingHealthForPage(r.Context(), pageID)
	_, err = s.st.PublishPage(r.Context(), pageID, userID)
	return err
}

// handlePageResetElement removes a single override on a page and republishes —
// the dashboard's per-binding "Reset" action.
func (s *Server) handlePageResetElement(w http.ResponseWriter, r *http.Request) {
	page, ok := s.pageInSite(w, r)
	if !ok {
		return
	}
	var body struct {
		Selector string `json:"selector"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if body.Selector == "" {
		writeError(w, http.StatusBadRequest, "selector required")
		return
	}
	if err := s.st.DeleteElement(r.Context(), page.ID, body.Selector); err != nil {
		s.internalError(w, err)
		return
	}
	_ = s.st.DeleteBindingHealth(r.Context(), page.ID, body.Selector)
	if _, err := s.st.PublishPage(r.Context(), page.ID, userFrom(r).ID); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "reset"})
}

// handlePageReset reverts one page to its original (unedited) markup, live.
func (s *Server) handlePageReset(w http.ResponseWriter, r *http.Request) {
	page, ok := s.pageInSite(w, r)
	if !ok {
		return
	}
	if err := s.resetPage(r, page.ID, userFrom(r).ID); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "reset"})
}

// handleSiteReset reverts every page of a site to original markup, live.
func (s *Server) handleSiteReset(w http.ResponseWriter, r *http.Request) {
	pages, err := s.st.PagesForSite(r.Context(), siteFrom(r).ID)
	if err != nil {
		s.internalError(w, err)
		return
	}
	uid := userFrom(r).ID
	for _, p := range pages {
		if err := s.resetPage(r, p.ID, uid); err != nil {
			s.internalError(w, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "reset", "pages": len(pages)})
}

// handlePagePublish publishes a page's current drafts as a new revision.
func (s *Server) handlePagePublish(w http.ResponseWriter, r *http.Request) {
	page, ok := s.pageInSite(w, r)
	if !ok {
		return
	}
	rev, err := s.st.PublishPage(r.Context(), page.ID, userFrom(r).ID)
	if err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"version": rev.Version, "publishedAt": rev.PublishedAt})
}

// handlePageDiscard reverts a page's unpublished drafts back to published.
func (s *Server) handlePageDiscard(w http.ResponseWriter, r *http.Request) {
	page, ok := s.pageInSite(w, r)
	if !ok {
		return
	}
	if err := s.st.DiscardDrafts(r.Context(), page.ID); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "discarded"})
}

func (s *Server) handleRevisionRestore(w http.ResponseWriter, r *http.Request) {
	rev, err := s.st.RevisionByID(r.Context(), r.PathValue("revisionID"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "revision not found")
		return
	}
	if err != nil {
		s.internalError(w, err)
		return
	}
	page, err := s.st.PageByID(r.Context(), rev.PageID)
	if err != nil || page.SiteID != siteFrom(r).ID {
		writeError(w, http.StatusNotFound, "revision not found")
		return
	}
	newRev, err := s.st.RestoreRevision(r.Context(), rev.ID, userFrom(r).ID)
	if err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newRev)
}
