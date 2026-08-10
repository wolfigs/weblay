# Self-hosting Weblay

Weblay is designed to be boring to operate: one process, one data directory,
no external services.

## Docker (recommended)

```bash
docker run -d --name weblay \
  -p 8787:8787 \
  -v weblay-data:/data \
  -e WEBLAY_BASE_URL=https://edit.example.com \
  wolfigs/weblay
```

## Binary

Download a release (or `make server`) and run:

```bash
WEBLAY_BASE_URL=https://edit.example.com ./weblay serve -data /var/lib/weblay
```

A systemd unit:

```ini
[Unit]
Description=Weblay
After=network.target

[Service]
User=weblay
ExecStart=/usr/local/bin/weblay serve -data /var/lib/weblay
Environment=WEBLAY_BASE_URL=https://edit.example.com
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## TLS

Terminate TLS in front of Weblay. With Caddy this is two lines:

```
edit.example.com {
    reverse_proxy localhost:8787
}
```

Set `WEBLAY_BASE_URL=https://edit.example.com` so cookies are marked Secure and
upload URLs are absolute.

## Postgres

SQLite (the default) comfortably serves small teams — content reads are
cached manifests, so database load is light. Switch to Postgres when you want
managed backups or multiple replicas:

```bash
weblay serve -dsn "postgres://user:pass@host:5432/weblay?sslmode=require"
```

The schema is created automatically on first boot.

## Backups

Everything lives in the data directory:

- `weblay.db` — SQLite database (skip when using Postgres)
- `uploads/` — images uploaded through the editor
- `secret` — instance secret; keep it with the backup

`sqlite3 weblay.db ".backup backup.db"` gives a consistent snapshot without
stopping the server.

## Caching / CDN

Manifests (`/m/…`) are served with `Cache-Control: public, max-age=30,
stale-while-revalidate=300` and strong ETags; uploaded assets (`/a/…`) are
immutable with a one-year max-age. Any CDN (Cloudflare, Fastly, CloudFront)
can sit in front of the whole server with default settings — publishes
propagate within the 30-second manifest window.

## Security model

- Dashboard sessions: httpOnly, SameSite=Lax cookies; argon2id password hashes.
- On-site editing: short-lived (4 h) bearer tokens handed off via URL fragment,
  scoped to one site, revoked server-side on expiry. The editor only runs on
  origins you register per site.
- Editors can change text and an allowlisted set of attributes (`src`, `href`,
  `alt`, …). Stored content is applied with `textContent`, never `innerHTML`,
  and `javascript:` URLs are rejected.
- Credential endpoints are rate-limited per IP.
