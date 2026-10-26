import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { assetsInlineLimit: 0 },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq, request) => {
            // Preserve the production same-origin check behind the local Vite proxy.
            if (request.headers.origin === `http://${request.headers.host}`)
              proxyReq.setHeader("origin", "http://127.0.0.1:8787");
          });
        },
        changeOrigin: true,
      },
    },
  },
});
