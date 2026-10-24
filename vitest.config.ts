import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/portals/src"),
      "@recircuit/llm": path.resolve(__dirname, "packages/llm/src"),
      "@recircuit/core": path.resolve(__dirname, "packages/core/src"),
    },
  },
  test: {
    // Bound parallel WASM databases and filesystem-heavy workers on developer machines.
    maxWorkers: 1,
    env: { CAPTCHA_SECRET: "vitest-only-captcha-secret", RECIRCUIT_DATA_DIR: path.resolve(__dirname, ".data", "unit-isolated-" + Date.now()) },
    globals: true,
    environment: "node",
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts"]
    }
  }
});

