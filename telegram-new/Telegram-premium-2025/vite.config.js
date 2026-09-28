import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  assetsInclude: ["*/.jpg", "*/.png", "*/.jpeg"],
  server: {
    port: 5173,
    strictPort: true,   // fail loudly instead of silently picking a different port
  },
});