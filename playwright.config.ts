import { defineConfig } from "@playwright/test";

/**
 * E2E flows over the PRODUCTION build (vite build + preview): verdict
 * states, stub-fill routing, schedule splitting, onboarding. The
 * Anthropic API is always route-mocked — nothing leaves the machine.
 * Set PW_CHROMIUM to a chromium binary to skip browser download
 * (this repo's dev container: /opt/pw-browsers/chromium).
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://localhost:5199",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: "npm run preview:e2e",
    url: "http://localhost:5199",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
