import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted Inter — the non-Apple fallback for the SF Pro system stack.
// Offline, nothing leaves the device; Apple devices render SF Pro natively.
import "@fontsource-variable/inter/wght.css";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App.tsx";
import ErrorBoundary from "./ui/ErrorBoundary.tsx";

// An installed PWA can sit resident for days — without these checks it
// only discovers new versions on a cold launch. autoUpdate swaps the
// worker silently; the What's-new sheet announces it after the fact.
registerSW({
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
