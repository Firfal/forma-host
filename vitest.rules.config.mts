import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests des règles de sécurité : lancés via `npm run test:rules` (émulateurs démarrés par firebase).
export default defineConfig({
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  test: {
    include: ["tests/rules/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
