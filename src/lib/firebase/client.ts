import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import type { Functions } from "firebase/functions";
import type { FirebaseStorage } from "firebase/storage";
import { REGION } from "@shared/constants";

export const usingEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

function firebaseOptions(): FirebaseOptions {
  const raw = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (raw) return JSON.parse(raw) as FirebaseOptions;
  if (!usingEmulators && typeof window !== "undefined") {
    console.error(
      "Config Firebase manquante : définir NEXT_PUBLIC_FIREBASE_CONFIG ou NEXT_PUBLIC_USE_EMULATORS=true",
    );
  }
  // Projet « demo » : utilisé avec les émulateurs, et pendant le prérendu sans config.
  return {
    apiKey: "demo-api-key",
    authDomain: "demo-forma.firebaseapp.com",
    projectId: "demo-forma",
    storageBucket: "demo-forma.appspot.com",
    appId: "demo-app",
  };
}

const app = getApps().length ? getApp() : initializeApp(firebaseOptions());

export const auth = getAuth(app);
export const db = getFirestore(app);

const globalForEmulators = globalThis as unknown as {
  __formaEmulators?: boolean;
  __formaStorageEmulator?: boolean;
  __formaFunctionsEmulator?: boolean;
};
if (usingEmulators && !globalForEmulators.__formaEmulators) {
  globalForEmulators.__formaEmulators = true;
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

/** Charge un SDK à la première utilisation ; un échec (réseau) permet de réessayer. */
function lazy<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= load().catch((error: unknown) => {
      pending = null;
      throw error;
    });
    return pending;
  };
}

/**
 * Storage et Functions ne servent qu'aux téléversements et aux actions serveur : chargés à la
 * demande, ils restent hors du JavaScript commun à toutes les pages.
 */
export const loadStorage = lazy(async () => {
  const sdk = await import("firebase/storage");
  const storage: FirebaseStorage = sdk.getStorage(app);
  if (usingEmulators && !globalForEmulators.__formaStorageEmulator) {
    globalForEmulators.__formaStorageEmulator = true;
    sdk.connectStorageEmulator(storage, "127.0.0.1", 9199);
  }
  return { sdk, storage };
});

export const loadFunctions = lazy(async () => {
  const sdk = await import("firebase/functions");
  const functions: Functions = sdk.getFunctions(app, REGION);
  if (usingEmulators && !globalForEmulators.__formaFunctionsEmulator) {
    globalForEmulators.__formaFunctionsEmulator = true;
    sdk.connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  }
  return { sdk, functions };
});
