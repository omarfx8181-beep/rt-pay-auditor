import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted Knockdown fonts — offline, nothing leaves the device.
import "@fontsource-variable/fraunces/standard.css";
import "@fontsource-variable/spline-sans/wght.css";
import "@fontsource-variable/spline-sans-mono/wght.css";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
