import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted Inter — the non-Apple fallback for the SF Pro system stack.
// Offline, nothing leaves the device; Apple devices render SF Pro natively.
import "@fontsource-variable/inter/wght.css";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App.tsx";
import ErrorBoundary from "./ui/ErrorBoundary.tsx";

import { markUpdateReady } from "./lib/swUpdate.ts";

// An installed PWA can sit resident for days — without these checks it
// only discovers new versions on a cold launch. Prompt mode: the new
// build installs quietly, the app shows a "Restart" toast, the user
// picks the moment; the What's-new sheet tells the story afterward.
const updateSW = registerSW({
  onNeedRefresh() {
    markUpdateReady(() => void updateSW(true));
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => void registration.update().catch(() => {});
    setInterval(check, 60 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
