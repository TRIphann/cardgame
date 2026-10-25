import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

// Vitest config.
//
// We MERGE the app's vite.config.js so the test run resolves the exact same
// path aliases (@shared, @config, @games, @pages, @assets) and applies the
// same React plugin as the production build. Without this, any test that
// imports a module using an alias would fail to resolve.
//
// Test files live under src/__tests__ so that `npm run lint` (which scans
// `src`) also covers them — a test that fails lint fails CI.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/__tests__/setup.js"],
      include: ["src/**/*.{test,spec}.{js,jsx}"],
      exclude: ["node_modules/**", "dist/**", "e2e/**", "manual/**"],
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "lcov"],
        reportsDirectory: "./coverage",
        include: [
          "src/games/**/*.js",
          "src/config/**/*.js",
          "src/pages/game/card*.js",
          "src/shared/realtime/useGameChannel.js",
          "src/shared/animation/**/*.js",
        ],
        exclude: ["**/*.test.js", "**/*.spec.js", "node_modules/**"],
      },
    },
  }),
);
