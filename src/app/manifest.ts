import type { MetadataRoute } from "next";

/*
 * Colours follow the app's default (dark) theme so the launch splash hands over to the first
 * paint without a flash: background = dark canvas token, theme = the same so the status bar blends.
 * Shortcuts open real routes; `?action=add|split` opens the matching dialog (see khata-provider.tsx).
 */
const ICON = { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" } as const;

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Khata: money and splits",
    short_name: "Khata",
    description: "Track spending and income in NPR, split bills with friends and groups, and settle up.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    // No window-controls-overlay: the layout does not reserve the titlebar area on desktop installs.
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#000000",
    theme_color: "#000000",
    lang: "en",
    dir: "ltr",
    categories: ["finance", "productivity", "utilities"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-monochrome-512.png", sizes: "512x512", type: "image/png", purpose: "monochrome" },
    ],
    shortcuts: [
      { name: "Add entry", short_name: "Add", description: "Write a new bank or cash entry", url: "/?action=add&source=shortcut", icons: [ICON] },
      { name: "Split expense", short_name: "Split", description: "Split a bill with friends or a group", url: "/?action=split&source=shortcut", icons: [ICON] },
      { name: "Balances", short_name: "Balances", description: "Who owes whom, and settle up", url: "/balances?source=shortcut", icons: [ICON] },
      { name: "Ledger", short_name: "Ledger", description: "Every bank and cash entry", url: "/ledger?source=shortcut", icons: [ICON] },
    ],
  };
}
