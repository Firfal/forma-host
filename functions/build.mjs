// Bundle des Functions : shared/ et zod sont inclus, firebase-* restent des dépendances.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "lib/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  external: ["firebase-admin", "firebase-functions"],
  alias: {
    "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
  },
  logLevel: "info",
});
