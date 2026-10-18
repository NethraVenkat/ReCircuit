import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/portals/src"),
      "@recircuit/llm": path.resolve(__dirname, "packages/llm/src"),
      "@recircuit/core": path.resolve(__dirname, "packages/core/src"),
    },
  },
  test: {
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

