// Example App-Router server component using the Weblay helper. The edited hero
// title and image are rendered on the server, so they are present in the HTML
// a crawler receives — no client-side swap, no flash.
//
// Copy weblay.ts into your project (e.g. lib/weblay.ts) and import from there.

import { weblayManifest, weblayText, weblayAttr } from "./weblay";

export default async function Home() {
  const m = await weblayManifest("/");
  return (
    <main>
      <h1 data-weblay="hero-title">{weblayText(m, "hero-title", "Welcome")}</h1>
      <img
        data-weblay="hero-image"
        src={weblayAttr(m, "hero-image", "src", "/default-hero.jpg")}
        alt={weblayText(m, "hero-image-alt", "Hero")}
      />
    </main>
  );
}
