// Package web embeds the admin dashboard and the built connector script so
// the release binary is fully self-contained.
package web

import "embed"

// Admin holds the dashboard SPA.
//
//go:embed admin
var Admin embed.FS

// Connector holds the built connector script (see connector/ for sources;
// `make connector` regenerates it).
//
//go:embed connector/weblay.js
var Connector embed.FS
