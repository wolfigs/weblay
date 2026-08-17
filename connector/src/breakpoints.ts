// Responsive model, shared by the visitor runtime and the editor.
//
// A media bucket is keyed by its max-width threshold in px (e.g. "640"), so the
// data is self-describing: visitors get `@media (max-width: 640px)` generated
// straight from the keys, and advanced users can design at ANY width by editing
// at a custom threshold — no fixed set of breakpoints baked in.
//
// The cascade is desktop-first: base styles apply everywhere; a bucket applies
// at its threshold and below. On a small screen several buckets match, so they
// are ordered widest-first and the narrowest wins.

export interface DevicePreset {
  id: string;
  label: string;
  previewWidth: number; // iframe width the editor previews at; 0 = full/desktop
  maxWidth: number;     // media-query threshold the preset edits; 0 = base
  icon: string;         // SVG inner markup for a 24x24 stroke icon
}

// Curated quick-pick devices. Advanced users override the width freely.
export const PRESETS: DevicePreset[] = [
  {
    id: "desktop", label: "Desktop", previewWidth: 0, maxWidth: 0,
    icon: `<rect x="2" y="4" width="20" height="13" rx="1.5"/><path d="M8 20h8M12 17v3"/>`,
  },
  {
    id: "tablet", label: "Tablet", previewWidth: 820, maxWidth: 1024,
    icon: `<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M11 18h2"/>`,
  },
  {
    id: "mobile", label: "Mobile", previewWidth: 390, maxWidth: 640,
    icon: `<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>`,
  },
];

// A media bucket key is valid if it is a positive integer number of pixels.
export function parseThreshold(key: string): number | null {
  if (!/^\d+$/.test(key)) return null;
  const n = parseInt(key, 10);
  return n > 0 && n <= 10000 ? n : null;
}
