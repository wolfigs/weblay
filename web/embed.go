// Package web embeds the admin dashboard and the built connector script so
// the release binary is fully self-contained.
package web

import "embed"

// Admin holds the dashboard SPA.
//
//go:embed admin
var Admin embed.FS

// Connector holds the built connector scripts (see connector/ for sources;
// `make connector` regenerates them). weblay.js is the tiny visitor runtime;
// weblay-editor.js is the editor UI, lazily loaded only when a token is present.
//
//go:embed connector/weblay.js connector/weblay-editor.js
var Connector embed.FS
