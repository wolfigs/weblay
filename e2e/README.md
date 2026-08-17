# Weblay E2E (Playwright)

Browser end-to-end tests for the dashboard and the connector edit→publish loop.
These complement the connector unit tests (`connector/ npm test`) and the Go
API tests, exercising the real UI in a browser.

## Setup (one-time)

```sh
cd e2e
npm install
npm run install-browsers   # downloads Chromium (needs network)
```

## Run

Against a running server (e.g. the demo stack from `scratchpad/restart.sh`):

```sh
WEBLAY_BASE_URL=http://localhost:8787 npm test
```

Or let Playwright boot a throwaway SQLite server:

```sh
WEBLAY_WEBSERVER=1 npm test
```

To include the in-page connector edit loop, point at an installed demo site:

```sh
WEBLAY_DEMO_URL=http://localhost:5555 WEBLAY_BASE_URL=http://localhost:8787 npm test
```

## CI

The tests are CI-ready (`reporter: github`, retries on CI). They are not yet in
`.github/workflows/ci.yml` because they need a browser download and a running
server; add a job that runs `npm run install-browsers` then `npm test` with
`WEBLAY_WEBSERVER=1` when you want them gated on every PR.
