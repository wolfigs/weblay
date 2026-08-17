package drift

import (
	"context"
	"os"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
	"golang.org/x/net/html"
)

// chromePaths lists common Chrome/Chromium locations; the first that exists is
// used, otherwise chromedp falls back to its own auto-detection.
var chromePaths = []string{
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/Applications/Chromium.app/Contents/MacOS/Chromium",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium",
	"/usr/bin/chromium-browser",
	"/snap/bin/chromium",
}

func chromeExecPath() string {
	for _, p := range chromePaths {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// renderSettle is how long the crawler waits after navigation for a client-side
// framework to mount and inject content before capturing the DOM.
const renderSettle = 600 * time.Millisecond

// renderFetch loads a page in headless Chrome, waits briefly for client-side
// rendering to settle, and returns the parsed post-render DOM. It is the
// rendering crawl channel for single-page applications whose content is injected
// by JavaScript and is therefore absent from the initial HTML response. The
// static fetch() remains the default; renderFetch is used only as an escalation.
func (c *Crawler) renderFetch(ctx context.Context, url string) (*html.Node, error) {
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("headless", true),
		chromedp.NoSandbox,
		chromedp.Flag("disable-gpu", true),
	)
	if p := chromeExecPath(); p != "" {
		opts = append(opts, chromedp.ExecPath(p))
	}
	actx, acancel := chromedp.NewExecAllocator(ctx, opts...)
	defer acancel()
	bctx, bcancel := chromedp.NewContext(actx)
	defer bcancel()
	tctx, tcancel := context.WithTimeout(bctx, 25*time.Second)
	defer tcancel()

	var rendered string
	if err := chromedp.Run(tctx,
		chromedp.Navigate(url),
		chromedp.Sleep(renderSettle),
		chromedp.OuterHTML("html", &rendered, chromedp.ByQuery),
	); err != nil {
		return nil, err
	}
	return html.Parse(strings.NewReader(rendered))
}
