package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/wolfigs/inlay/internal/store"
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
	writeJSON(w, http.StatusOK, sites)
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
