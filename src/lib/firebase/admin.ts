import "server-only";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Admin SDK côté serveur (pages publiques rendues par Next.js).
 * Sur App Hosting : identifiants par défaut du backend. En local : émulateur Firestore.
 */
function projectId(): string | undefined {
  try {
    const config = JSON.parse(process.env.NEXT_PUBLIC_FIREBASE_CONFIG || "{}") as {
      projectId?: string;
    };
    if (config.projectId) return config.projectId;
  } catch {
    // Config absente ou invalide : on retombe sur les variables Google Cloud.
  }
  return process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT;
}

if (process.env.NEXT_PUBLIC_USE_EMULATORS === "true") {
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
}

const app =
  getApps()[0] ??
  initializeApp({
    projectId: process.env.NEXT_PUBLIC_USE_EMULATORS === "true" ? "demo-forma" : projectId(),
  });

export const adminDb = getFirestore(app);
