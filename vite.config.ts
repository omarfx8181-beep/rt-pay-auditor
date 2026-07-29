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
        registerType: "autoUpdate",
        includeAssets: ["apple-touch-icon.png"],
        manifest: {
          name: "RT Pay",
          short_name: "RT Pay",
          description: "Know what the check should say before it lands.",
          display: "standalone",
          theme_color: "#f4efe6",
          background_color: "#f4efe6",
          // relative to the manifest URL so any base path works
          icons: [
            { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
            { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
            { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,woff2,png,svg}"],
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
