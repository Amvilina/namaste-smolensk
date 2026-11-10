import { defineConfig, type Plugin } from "vite";

function workerPage(): Plugin {
  return {
    name: "worker-page",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/worker" || req.url === "/worker/") req.url = "/worker.html";
        if (req.url === "/admin" || req.url === "/admin/") req.url = "/admin.html";
        if (req.url === "/legal/privacy" || req.url === "/legal/privacy/") req.url = "/legal/privacy.html";
        if (req.url === "/legal/consent" || req.url === "/legal/consent/") req.url = "/legal/consent.html";
        next();
      });
    },
  };
}

export default defineConfig({
  base: "/",
  plugins: [workerPage()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        worker: "worker.html",
        admin: "admin.html",
        privacy: "legal/privacy.html",
        consent: "legal/consent.html",
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8080",
      "/login": "http://127.0.0.1:8080",
      "/logout": "http://127.0.0.1:8080",
    },
  },
});
