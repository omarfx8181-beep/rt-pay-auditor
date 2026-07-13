import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted Inter — the non-Apple fallback for the SF Pro system stack.
// Offline, nothing leaves the device; Apple devices render SF Pro natively.
import "@fontsource-variable/inter/wght.css";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
