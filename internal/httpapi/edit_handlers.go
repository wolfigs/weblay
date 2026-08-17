package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/wolfigs/weblay/internal/sanitize"
	"github.com/wolfigs/weblay/internal/store"
)

// handleEditSession lets the connector verify its token and learn who's editing.
func (s *Server) handleEditSession(w http.ResponseWriter, r *http.Request) {
	u, err := s.st.UserByID(r.Context(), grantFrom(r).UserID)
	if err != nil {
		s.internalError(w, err)
		return
	}
	site := siteFrom(r)
	writeJSON(w, http.StatusOK, map[string]any{
		"user": map[string]string{"name": u.Name, "email": u.Email},
		"site": map[string]string{"id": site.ID, "name": site.Name, "key": site.SiteKey},
	})
}

// handleEditContentGet returns draft content for a page so the editor can
// show unpublished work-in-progress.
func (s *Server) handleEditContentGet(w http.ResponseWriter, r *http.Request) {
	path := normalizePath(r.URL.Query().Get("path"))
	page, err := s.st.PageByPath(r.Context(), siteFrom(r).ID, path)
	if errors.Is(err, store.ErrNotFound) {
		writeJSON(w, http.StatusOK, map[string]any{"path": path, "elements": map[string]any{}, "publishedVersion": 0})
		return
	}
	if err != nil {
		s.internalError(w, err)
		return
	}
	elems, err := s.st.ElementsForPage(r.Context(), page.ID)
	if err != nil {
		s.internalError(w, err)
		return
	}
	drafts := map[string]*store.ElementContent{}
	revs := map[string]int{}
	for _, e := range elems {
		revs[e.Selector] = e.Rev
		if e.Draft != nil {
			drafts[e.Selector] = e.Draft
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"path":             page.Path,
		"elements":         drafts,
		"revs":             revs, // per-element optimistic-concurrency tokens
		"publishedVersion": page.PublishedVersion,
	})
}

// handleEditContentPut saves a draft for one element.
func (s *Server) handleEditContentPut(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path       string                `json:"path"`
		Selector   string                `json:"selector"`
		Content    *store.ElementContent `json:"content"`
		BaseRev    *int                  `json:"baseRev"` // optimistic-concurrency token; nil = unconditional
		Descriptor json.RawMessage       `json:"descriptor"`
		Risk       struct {
			Confidence int      `json:"confidence"`
			Reasons    []string `json:"reasons"`
		} `json:"risk"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if body.Selector == "" || body.Content == nil {
		writeError(w, http.StatusBadRequest, "selector and content required")
		return
	}
	// Sanitize before storage — this is an independent trust boundary from the
	// connector's client-side sanitizer. Stored content is thus always clean.
	if body.Content.HTML != nil {
		clean := sanitize.HTML(*body.Content.HTML)
		body.Content.HTML = &clean
	}
	body.Content.Attrs = sanitize.Attrs(body.Content.Attrs)
	body.Content.Style = sanitize.Style(body.Content.Style)
	if body.Content.Media != nil {
		clean := make(map[string]map[string]string, len(body.Content.Media))
		for bp, styles := range body.Content.Media {
			// Media keys are px thresholds; reject anything else so generated
			// @media rules can never contain attacker-controlled text.
			if n, err := strconv.Atoi(bp); err != nil || n <= 0 || n > 10000 {
				continue
			}
			if s := sanitize.Style(styles); len(s) > 0 {
				clean[bp] = s
			}
		}
		body.Content.Media = clean
	}

	page, err := s.st.EnsurePage(r.Context(), siteFrom(r).ID, normalizePath(body.Path))
	if err != nil {
		s.internalError(w, err)
		return
	}
	// Optimistic concurrency: when the client sends the base rev it loaded, a
	// mismatch means another editor changed this element first — reject with 409
	// and the current rev so the client can reload instead of silently clobbering.
	baseRev := 0
	if body.BaseRev != nil {
		baseRev = *body.BaseRev
	}
	newRev, err := s.st.UpsertDraftChecked(r.Context(), page.ID, body.Selector, body.Content, grantFrom(r).UserID, baseRev)
	if errors.Is(err, store.ErrConflict) {
		cur := currentRev(r.Context(), s.st, page.ID, body.Selector)
		writeJSON(w, http.StatusConflict, map[string]any{
			"error":      "edit conflict: this element changed since you loaded it",
			"currentRev": cur,
		})
		return
	}
	if err != nil {
		s.internalError(w, err)
		return
	}
	// Record the binding's identity descriptor + bind-time risk (detection
	// channel #1). Best-effort: a failure here must not fail the save.
	if len(body.Descriptor) > 0 || len(body.Risk.Reasons) > 0 || body.Risk.Confidence > 0 {
		conf := body.Risk.Confidence
		if conf == 0 {
			conf = 100
		}
		_ = s.st.UpsertBindingDescriptor(r.Context(), &store.BindingHealth{
			SiteID:     siteFrom(r).ID,
			PageID:     page.ID,
			Path:       page.Path,
			Selector:   body.Selector,
			Descriptor: string(body.Descriptor),
			Confidence: conf,
			Reasons:    body.Risk.Reasons,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "saved", "rev": newRev})
}

// currentRev looks up the live rev for an element after a conflict, so the
// client can rebase onto it. Best-effort: 0 if it can't be read.
func currentRev(ctx context.Context, st store.Store, pageID, selector string) int {
	elems, err := st.ElementsForPage(ctx, pageID)
	if err != nil {
		return 0
	}
	for _, e := range elems {
		if e.Selector == selector {
			return e.Rev
		}
	}
	return 0
}

// handleEditContentDelete removes an element override entirely.
func (s *Server) handleEditContentDelete(w http.ResponseWriter, r *http.Request) {
	path := normalizePath(r.URL.Query().Get("path"))
	selector := r.URL.Query().Get("selector")
	if selector == "" {
		writeError(w, http.StatusBadRequest, "selector required")
		return
	}
	page, err := s.st.PageByPath(r.Context(), siteFrom(r).ID, path)
	if errors.Is(err, store.ErrNotFound) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "removed"})
		return
	}
	if err != nil {
		s.internalError(w, err)
		return
	}
	if err := s.st.DeleteElement(r.Context(), page.ID, selector); err != nil {
		s.internalError(w, err)
		return
	}
	_ = s.st.DeleteBindingHealth(r.Context(), page.ID, selector) // best-effort cleanup
	writeJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}

// handleEditPublish publishes all drafts on a page as a new revision.
func (s *Server) handleEditPublish(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path string `json:"path"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	page, err := s.st.EnsurePage(r.Context(), siteFrom(r).ID, normalizePath(body.Path))
	if err != nil {
		s.internalError(w, err)
		return
	}
	// Approval gate: a plain editor cannot publish straight to production — their
	// publish becomes a review request that a site owner/admin approves. Owners
	// and admins publish directly.
	if !s.canPublishGrant(r, page.SiteID, grantFrom(r).UserID) {
		if err := s.st.SubmitReview(r.Context(), page.ID, grantFrom(r).UserID); err != nil {
			s.internalError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"review": store.ReviewPending, "status": "submitted for approval"})
		return
	}
	rev, err := s.st.PublishPage(r.Context(), page.ID, grantFrom(r).UserID)
	if err != nil {
		s.internalError(w, err)
		return
	}
	_ = s.st.ClearReview(r.Context(), page.ID)
	writeJSON(w, http.StatusOK, map[string]any{"version": rev.Version, "publishedAt": rev.PublishedAt})
}

// handleEditDiscard reverts the current page's unpublished drafts back to the
// published state, from the on-site editor.
func (s *Server) handleEditDiscard(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path string `json:"path"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	page, err := s.st.PageByPath(r.Context(), siteFrom(r).ID, normalizePath(body.Path))
	if errors.Is(err, store.ErrNotFound) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "discarded"})
		return
	}
	if err != nil {
		s.internalError(w, err)
		return
	}
	if err := s.st.DiscardDrafts(r.Context(), page.ID); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "discarded"})
}

// handleEditResetElement removes one override entirely and republishes, so the
// element reverts to its original markup live. Recoverable via version history.
func (s *Server) handleEditResetElement(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path     string `json:"path"`
		Selector string `json:"selector"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if body.Selector == "" {
		writeError(w, http.StatusBadRequest, "selector required")
		return
	}
	page, err := s.st.PageByPath(r.Context(), siteFrom(r).ID, normalizePath(body.Path))
	if errors.Is(err, store.ErrNotFound) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "reset"})
		return
	}
	if err != nil {
		s.internalError(w, err)
		return
	}
	if err := s.st.DeleteElement(r.Context(), page.ID, body.Selector); err != nil {
		s.internalError(w, err)
		return
	}
	_ = s.st.DeleteBindingHealth(r.Context(), page.ID, body.Selector)
	rev, err := s.st.PublishPage(r.Context(), page.ID, grantFrom(r).UserID)
	if err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "reset", "version": rev.Version})
}

// handleEditRevisionsList returns published versions for the current page so
// the on-site editor can show version history.
func (s *Server) handleEditRevisionsList(w http.ResponseWriter, r *http.Request) {
	path := normalizePath(r.URL.Query().Get("path"))
	page, err := s.st.PageByPath(r.Context(), siteFrom(r).ID, path)
	if errors.Is(err, store.ErrNotFound) {
		writeJSON(w, http.StatusOK, []any{})
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

// revisionForSite loads a revision and confirms it belongs to the granted site.
func (s *Server) revisionForSite(w http.ResponseWriter, r *http.Request) (*store.Revision, bool) {
	rev, err := s.st.RevisionByID(r.Context(), r.PathValue("revisionID"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "revision not found")
		return nil, false
	}
	if err != nil {
		s.internalError(w, err)
		return nil, false
	}
	page, err := s.st.PageByID(r.Context(), rev.PageID)
	if err != nil || page.SiteID != siteFrom(r).ID {
		writeError(w, http.StatusNotFound, "revision not found")
		return nil, false
	}
	return rev, true
}

// handleEditRevisionGet returns one revision's full manifest for read-only view.
func (s *Server) handleEditRevisionGet(w http.ResponseWriter, r *http.Request) {
	rev, ok := s.revisionForSite(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, rev)
}

// handleEditRevisionRestoreDraft copies a past revision into the page's drafts
// without publishing, so the editor can review and then publish it.
func (s *Server) handleEditRevisionRestoreDraft(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.revisionForSite(w, r); !ok {
		return
	}
	if _, err := s.st.RestoreRevisionToDraft(r.Context(), r.PathValue("revisionID"), grantFrom(r).UserID); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "restored"})
}

var allowedImageTypes = map[string]string{
	"image/jpeg":    ".jpg",
	"image/png":     ".png",
	"image/gif":     ".gif",
	"image/webp":    ".webp",
	"image/svg+xml": ".svg",
	"image/avif":    ".avif",
}

// handleEditUpload stores an image and returns its public URL.
func (s *Server) handleEditUpload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, s.cfg.MaxUploadSize)
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "multipart 'file' field required")
		return
	}
	defer file.Close()

	ext, err := sniffImageExt(file, header)
	if err != nil {
		writeError(w, http.StatusUnsupportedMediaType, err.Error())
		return
	}

	site := siteFrom(r)

	// Per-site storage quota. Reject early if the site is already at the cap.
	if s.cfg.MaxSiteStorageBytes > 0 {
		used, err := s.st.TotalAssetBytesForSite(r.Context(), site.ID)
		if err != nil {
			s.internalError(w, err)
			return
		}
		if used >= s.cfg.MaxSiteStorageBytes {
			writeError(w, http.StatusInsufficientStorage, "site storage quota exceeded")
			return
		}
	}

	assetID := store.NewID()
	safeName := sanitizeFilename(header.Filename, ext)
	siteDir := filepath.Join(s.cfg.UploadsDir, site.ID)
	if err := os.MkdirAll(siteDir, 0o700); err != nil {
		s.internalError(w, err)
		return
	}
	diskPath := filepath.Join(siteDir, assetID+ext)

	// SVGs are an XSS vector: reject any carrying active content, and store the
	// validated bytes. Raster formats stream straight to disk.
	var svgClean []byte
	if ext == ".svg" {
		raw, err := io.ReadAll(file)
		if err != nil {
			s.internalError(w, err)
			return
		}
		if svgClean, err = sanitize.SVG(raw); err != nil {
			writeError(w, http.StatusUnsupportedMediaType, err.Error())
			return
		}
	}

	dst, err := os.OpenFile(diskPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		s.internalError(w, err)
		return
	}
	var size int64
	if svgClean != nil {
		var n int
		n, err = dst.Write(svgClean)
		size = int64(n)
	} else {
		size, err = io.Copy(dst, file)
	}
	dst.Close()
	if err != nil {
		os.Remove(diskPath)
		s.internalError(w, err)
		return
	}

	// Enforce the quota against the actual written size (the pre-check used the
	// prior total; this catches a single upload that crosses the cap).
	if s.cfg.MaxSiteStorageBytes > 0 {
		used, err := s.st.TotalAssetBytesForSite(r.Context(), site.ID)
		if err == nil && used+size > s.cfg.MaxSiteStorageBytes {
			os.Remove(diskPath)
			writeError(w, http.StatusInsufficientStorage, "site storage quota exceeded")
			return
		}
	}

	asset := &store.Asset{
		ID:        assetID,
		SiteID:    site.ID,
		FileName:  safeName,
		DiskPath:  diskPath,
		SizeBytes: size,
		CreatedBy: grantFrom(r).UserID,
		CreatedAt: time.Now().UTC(),
	}
	if err := s.st.CreateAsset(r.Context(), asset); err != nil {
		os.Remove(diskPath)
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{
		"id":  assetID,
		"url": fmt.Sprintf("%s/a/%s/%s", s.assetBase(r), assetID, safeName),
	})
}

// handleAssetServe serves an uploaded file with long-lived caching (asset IDs
// are immutable).
func (s *Server) handleAssetServe(w http.ResponseWriter, r *http.Request) {
	asset, err := s.st.AssetByID(r.Context(), r.PathValue("assetID"))
	if errors.Is(err, store.ErrNotFound) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		s.internalError(w, err)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	// Defense in depth: even though SVG uploads are sanitized, serve them under a
	// locked-down CSP so any file that predates sanitization (or slips through)
	// cannot execute script or load off-origin resources.
	if strings.HasSuffix(strings.ToLower(asset.FileName), ".svg") ||
		strings.HasSuffix(strings.ToLower(asset.DiskPath), ".svg") {
		w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
	}
	http.ServeFile(w, r, asset.DiskPath)
}

// sniffImageExt validates the upload is a supported image by content, not
// just by declared type, and returns the extension to store it under.
func sniffImageExt(file multipart.File, header *multipart.FileHeader) (string, error) {
	buf := make([]byte, 512)
	n, _ := io.ReadFull(file, buf)
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return "", errors.New("cannot rewind upload")
	}
	detected := http.DetectContentType(buf[:n])
	// SVG detects as text/xml or text/plain; trust the declared type for it
	// but only when the extension agrees.
	if strings.HasPrefix(detected, "text/") &&
		header.Header.Get("Content-Type") == "image/svg+xml" &&
		strings.HasSuffix(strings.ToLower(header.Filename), ".svg") {
		detected = "image/svg+xml"
	}
	ext, ok := allowedImageTypes[detected]
	if !ok {
		return "", fmt.Errorf("unsupported file type %q — images only", detected)
	}
	return ext, nil
}

func sanitizeFilename(name, ext string) string {
	base := strings.TrimSuffix(filepath.Base(name), filepath.Ext(name))
	var b strings.Builder
	for _, r := range base {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteRune('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		out = "upload"
	}
	if len(out) > 64 {
		out = out[:64]
	}
	return out + ext
}
