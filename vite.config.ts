import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Proxy /api to the local FastAPI server during development so the frontend
// can always call relative paths, matching how same-origin Vercel deploys work.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
