import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/** Parse `--cle valeur` et `--drapeau`. */
export function parseArgs(argv = process.argv.slice(2)): Record<string, string | true> {
  const args: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key.slice(2)] = next;
      i++;
    } else {
      args[key.slice(2)] = true;
    }
  }
  return args;
}

/**
 * Admin SDK : émulateurs locaux avec --emulators (projet demo-forma),
 * sinon le vrai projet (--project <id> et identifiants par défaut : `gcloud auth application-default login`).
 */
export function initAdmin(args: Record<string, string | true>) {
  const useEmulators = args.emulators === true || Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  if (useEmulators) {
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
  }
  const projectId =
    typeof args.project === "string"
      ? args.project
      : useEmulators
        ? "demo-forma"
        : process.env.GCLOUD_PROJECT;
  if (!projectId) throw new Error("Préciser --project <id> ou --emulators");
  initializeApp({ projectId });
  return { auth: getAuth(), db: getFirestore(), projectId, useEmulators };
}
