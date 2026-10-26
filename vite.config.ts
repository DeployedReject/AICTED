import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "workspace-session",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const path = (req.url || "").split("?")[0];
          if (
            !/^\/(?:workspace|institution\/workspace|it\/(?:workspace|setup))(?:\/|$)/.test(
              path,
            )
          ) {
            next();
            return;
          }
          try {
            const response = await fetch(
              "http://127.0.0.1:" +
                (process.env.AICTED_API_PORT || "8787") +
                "/api/auth/me",
              {
                headers: { cookie: req.headers.cookie || "" },
              },
            );
            if (response.status === 401) {
              res.writeHead(302, {
                Location: path.startsWith("/it/")
                  ? "/it"
                  : path.startsWith("/institution/")
                    ? "/?portal=institution"
                    : "/",
              });
              res.end();
              return;
            }
            if (!response.ok) {
              res.writeHead(503);
              res.end("Sign-in is temporarily unavailable.");
              return;
            }
            const { user } = (await response.json()) as {
              user: { role: string };
            };
            const home =
              user.role === "it"
                ? "/it/workspace"
                : user.role === "institution"
                  ? "/institution/workspace"
                  : "/workspace";
            if (!path.startsWith(home)) {
              res.writeHead(302, { Location: home });
              res.end();
              return;
            }
            next();
          } catch {
            res.writeHead(503);
            res.end("Start the API server to sign in.");
          }
        });
      },
    },
  ],
  build: { assetsInlineLimit: 0 },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:" + (process.env.AICTED_API_PORT || "8787"),
        ws: true,
        configure(proxy) {
          proxy.on("proxyReqWs", (proxyReq, request) => {
            if (request.headers.origin === `http://${request.headers.host}`)
              proxyReq.setHeader(
                "origin",
                "http://127.0.0.1:" + (process.env.AICTED_API_PORT || "8787"),
              );
          });
          proxy.on("proxyReq", (proxyReq, request) => {
            // Preserve the production same-origin check behind the local Vite proxy.
            if (request.headers.origin === `http://${request.headers.host}`)
              proxyReq.setHeader(
                "origin",
                "http://127.0.0.1:" + (process.env.AICTED_API_PORT || "8787"),
              );
          });
        },
        changeOrigin: true,
      },
    },
  },
});
