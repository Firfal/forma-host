import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests d'intégration contre les émulateurs Auth + Firestore (npm run test:emu).
export default defineConfig({
  resolve: { alias: { "@shared": fileURLToPath(new URL("../shared", import.meta.url)) } },
  test: {
    include: ["src/**/*.emu.test.ts"],
    environment: "node",
    testTimeout: 30000,
    fileParallelism: false,
  },
});
