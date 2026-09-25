import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";
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
export const storage = getStorage(app);
export const functions = getFunctions(app, REGION);

const globalForEmulators = globalThis as unknown as { __formaEmulators?: boolean };
if (usingEmulators && !globalForEmulators.__formaEmulators) {
  globalForEmulators.__formaEmulators = true;
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
