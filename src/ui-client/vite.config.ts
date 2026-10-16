import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Caldrevan React frontend (UI-1). Development: `npm run ui:dev` serves this app on 127.0.0.1:5173 and proxies `/api` to the play server
 * (`npm run play:ui`, default http://127.0.0.1:3000; override with CALDREVAN_API_ORIGIN). Production: `npm run ui:build` writes dist/ui-client/,
 * which the play server serves under /app/. The browser always calls the same-origin relative `/api`, so no API base, key or secret is ever
 * compiled into the bundle; only variables prefixed CALDREVAN_PUBLIC_ could reach client code, and none exist.
 */
const root = fileURLToPath(new URL(".", import.meta.url));
const backend = process.env.CALDREVAN_API_ORIGIN ?? "http://127.0.0.1:3000";
const devOrigin = "http://127.0.0.1:5173";

export default defineConfig({
  root,
  base: "/app/",
  envPrefix: "CALDREVAN_PUBLIC_",
  plugins: [react()],
  css: { modules: { localsConvention: "camelCaseOnly" } },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: backend,
        changeOrigin: true,
        // The play server accepts a POST only from its own origin (loopback CSRF boundary). Only the Vite page's own origin is rewritten to the
        // backend's; any other Origin (a cross-site page) is forwarded unchanged and still refused by the server.
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq, req) => { if (req.headers.origin === devOrigin) proxyReq.setHeader("origin", backend); });
        },
      },
    },
  },
  build: {
    outDir: fileURLToPath(new URL("../../dist/ui-client", import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    // Never inline assets as data: URIs: the play server's CSP (default-src 'self') would block them. Every image is a same-origin file.
    assetsInlineLimit: 0,
  },
  test: {
    environment: "jsdom",
    include: ["**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
    restoreMocks: true,
    testTimeout: 20000,
  },
});
