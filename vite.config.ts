/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { configDefaults } from "vitest/config";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig(({ mode }) => {
  // VITE_BASE=/rt-pay-auditor/ for GitHub Pages; default root elsewhere.
  const base = loadEnv(mode, ".", "VITE_").VITE_BASE || "/";
  return {
    base,
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // prompt: the update waits for the user's tap — autoUpdate
        // hard-reloads the page the moment a new worker activates,
        // which would kill an in-flight scan or a mid-debounce edit.
        registerType: "prompt",
        includeAssets: ["apple-touch-icon.png"],
        manifest: {
          name: "RT Pay",
          short_name: "RT Pay",
          description: "Know what the check should say before it lands.",
          // the plugin fills start_url/scope from `base`; id has no such
          // default, and without it the identity is start_url — which would
          // make a future base change read as a brand new app.
          id: base,
          display: "standalone",
          theme_color: "#f4efe6",
          background_color: "#f4efe6",
          // relative to the manifest URL so any base path works
          icons: [
            { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
            { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
            { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
          // url takes start_url's absolute-path form: a relative one would
          // resolve against manifest.webmanifest, not the app root.
          shortcuts: [
            {
              name: "Scan this stub",
              short_name: "Scan stub",
              url: `${base}?action=scan-stub`,
              icons: [{ src: "pwa-192.png", sizes: "192x192", type: "image/png" }],
            },
            {
              name: "Add a shift",
              short_name: "Add shift",
              url: `${base}?action=add-shift`,
              icons: [{ src: "pwa-192.png", sizes: "192x192", type: "image/png" }],
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,woff2,png,svg}"],
          // Non-latin Inter subsets stay fetchable online but out of the
          // precache — they were ~40% of it and this app writes English.
          globIgnores: ["**/inter-*cyrillic*", "**/inter-*greek*", "**/inter-*vietnamese*"],
        },
      }),
    ],
    test: {
      environment: "node",
      // e2e/ belongs to Playwright, not Vitest
      exclude: [...configDefaults.exclude, "e2e/**"],
    },
  };
});
