// One-file build for hosted previews (Claude Artifacts): everything —
// JS, CSS, fonts — inlined, no PWA/service worker. Not the production
// build; see vite.config.ts + the Pages workflow for that.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: "dist-artifact",
    assetsInlineLimit: 100_000_000,
  },
});
