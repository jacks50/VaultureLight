/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Content Security Policy, injected into the production build only (the dev server needs inline
 * scripts for hot reload). GitHub Pages cannot send headers, hence a <meta> tag; `frame-ancestors`
 * is not supported in <meta>, so framing is refused in src/main.tsx instead.
 * Google Identity Services URLs follow https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' https://accounts.google.com/gsi/style",
  "font-src 'self'",
  "img-src 'self'",
  "manifest-src 'self'",
  "connect-src https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com/gsi/",
  "frame-src https://accounts.google.com/gsi/",
  "base-uri 'none'",
  "form-action 'none'",
  "require-trusted-types-for 'script'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
    ],
  };
}

export default defineConfig({
  // GitHub Pages serves the app under /VaultureLight/
  base: process.env.NODE_ENV === "production" ? "/VaultureLight/" : "/",
  plugins: [react(), contentSecurityPolicy()],
  // No data: URIs (fonts would be inlined otherwise), so the CSP can stay at 'self'
  build: { sourcemap: false, assetsInlineLimit: 0 },
  test: { environment: "node", setupFiles: ["tests/setup.ts"], testTimeout: 30_000 },
});
