package httpapi

import (
	"io/fs"
	"net/http"

	"github.com/wolfigs/weblay/web"
)

// mountAdmin serves the embedded dashboard at / and the connector at /weblay.js.
func (s *Server) mountAdmin(mux *http.ServeMux) {
	adminFS, err := fs.Sub(web.Admin, "admin")
	if err != nil {
		panic(err) // embed layout is fixed at compile time
	}
	fileServer := http.FileServer(http.FS(adminFS))

	mux.HandleFunc("GET /weblay.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600")
		http.ServeFileFS(w, r, web.Connector, "connector/weblay.js")
	})

	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		// The dashboard is a single-page app: serve real files when they
		// exist, index.html for everything else so client routes deep-link.
		if r.URL.Path != "/" {
			if f, err := adminFS.Open(r.URL.Path[1:]); err == nil {
				f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		http.ServeFileFS(w, r, web.Admin, "admin/index.html")
	})
}
