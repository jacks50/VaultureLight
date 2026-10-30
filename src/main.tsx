import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ToastProvider } from "./components/Toast";
import "./styles.css";

// Dev-only fake-data preview; the condition is false in production builds, so Demo is not bundled
const Demo = import.meta.env.DEV && new URLSearchParams(location.search).has("demo") ? lazy(() => import("./Demo")) : null;

// Refuse to run inside a frame (clickjacking); CSP frame-ancestors is unavailable on GitHub Pages
if (window.top !== window.self) throw new Error("VaultureLight cannot run inside a frame");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      {Demo ? (
        <Suspense>
          <Demo />
        </Suspense>
      ) : (
        <App />
      )}
    </ToastProvider>
  </StrictMode>,
);
