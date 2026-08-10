package httpapi

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wolfigs/inlay/internal/store"
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
	for _, e := range elems {
		if e.Draft != nil {
			drafts[e.Selector] = e.Draft
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"path":             page.Path,
		"elements":         drafts,
		"publishedVersion": page.PublishedVersion,
	})
}

// handleEditContentPut saves a draft for one element.
func (s *Server) handleEditContentPut(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path     string                `json:"path"`
		Selector string                `json:"selector"`
		Content  *store.ElementContent `json:"content"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if body.Selector == "" || body.Content == nil {
		writeError(w, http.StatusBadRequest, "selector and content required")
		return
	}
	page, err := s.st.EnsurePage(r.Context(), siteFrom(r).ID, normalizePath(body.Path))
	if err != nil {
		s.internalError(w, err)
		return
	}
	if err := s.st.UpsertDraft(r.Context(), page.ID, body.Selector, body.Content, grantFrom(r).UserID); err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "saved"})
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
	rev, err := s.st.PublishPage(r.Context(), page.ID, grantFrom(r).UserID)
	if err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"version": rev.Version, "publishedAt": rev.PublishedAt})
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
	assetID := store.NewID()
	safeName := sanitizeFilename(header.Filename, ext)
	siteDir := filepath.Join(s.cfg.UploadsDir, site.ID)
	if err := os.MkdirAll(siteDir, 0o700); err != nil {
		s.internalError(w, err)
		return
	}
	diskPath := filepath.Join(siteDir, assetID+ext)

	dst, err := os.OpenFile(diskPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		s.internalError(w, err)
		return
	}
	size, err := io.Copy(dst, file)
	dst.Close()
	if err != nil {
		os.Remove(diskPath)
		s.internalError(w, err)
		return
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
