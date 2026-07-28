import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vite config — React SPA.
//   - base: "/"; Netlify serves the SPA at site root.
//   - outDir: "dist"; Netlify publish = "frontend/dist".
//   - assetsDir: "assets"; keep flat so existing /assets/... URLs still work
//     when something links to them externally.
//   - manualChunks: split vendor (react, react-router) so the bundle isn't a
//     single megabyte file and reloads stay fast.
export default defineConfig({
  root: ".",
  base: "/",
  plugins: [react({ jsxRuntime: "automatic" })],

  resolve: {
    extensions: [".mjs", ".js", ".jsx", ".json"],
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
      "@config": path.resolve(__dirname, "src/config"),
      "@games": path.resolve(__dirname, "src/games"),
      "@pages": path.resolve(__dirname, "src/pages"),
      "@assets": path.resolve(__dirname, "src/assets"),
    },
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets",
    sourcemap: false,
    target: "es2020",
    minify: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("react-router")) return "router";
            if (id.includes("react-dom")) return "react-dom";
            if (id.includes("/react/")) return "react";
            return "vendor";
          }
        },
      },
    },
  },

  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      // Proxy /api to the .NET dev server so the browser doesn't hit CORS
      // during development.
      "/api": {
        target: "http://localhost:5080",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:5080",
        changeOrigin: true,
      },
    },
  },
});