package httpapi

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/wolfigs/weblay/internal/store"
)

// handleManifest serves the published content for one page. This is the hot
// path — one GET per page view — so it is cacheable: strong ETag derived from
// the payload, short max-age with stale-while-revalidate so a CDN can absorb
// traffic while publishes still propagate quickly.
func (s *Server) handleManifest(w http.ResponseWriter, r *http.Request) {
	site, err := s.st.SiteByKey(r.Context(), r.PathValue("siteKey"))
	if errors.Is(err, store.ErrNotFound) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		s.internalError(w, err)
		return
	}

	path := normalizePath(r.URL.Query().Get("path"))
	manifest := &store.Manifest{Version: 0, Elements: map[string]*store.ElementContent{}}

	page, err := s.st.PageByPath(r.Context(), site.ID, path)
	if err == nil {
		if manifest, err = s.st.PublishedManifest(r.Context(), page.ID); err != nil {
			s.internalError(w, err)
			return
		}
	} else if !errors.Is(err, store.ErrNotFound) {
		s.internalError(w, err)
		return
	}

	body, err := json.Marshal(manifest)
	if err != nil {
		s.internalError(w, err)
		return
	}

	etag := fmt.Sprintf(`"%x"`, sha256.Sum256(body))
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "public, max-age=30, stale-while-revalidate=300")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Write(body)
}
