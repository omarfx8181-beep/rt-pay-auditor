/// <reference types="vitest/config" />
import { configDefaults } from "vitest/config";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  // VITE_BASE=/rt-pay-auditor/ for GitHub Pages; default root elsewhere.
  const base = loadEnv(mode, ".", "VITE_").VITE_BASE || "/";
  return {
    base,
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
