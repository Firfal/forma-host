import { defineSecret, defineString } from "firebase-functions/params";
import { parseKey } from "./crypto";

/** URL publique de l'application (liens dans les emails). */
export const APP_URL = defineString("APP_URL", { default: "http://localhost:3000" });

/** Token personnel Vimeo (scope « private »), stocké dans Secret Manager. */
export const VIMEO_ACCESS_TOKEN = defineSecret("VIMEO_ACCESS_TOKEN");

/** Clé AES-256 (base64) des secrets saisis par les formateurs. Créée par bootstrap-firebase.ts. */
export const SETTINGS_ENCRYPTION_KEY = defineSecret("SETTINGS_ENCRYPTION_KEY");

/** Clé fixe, réservée aux émulateurs (aucun secret réel en local). */
const EMULATOR_KEY = Buffer.alloc(32, 7).toString("base64");

export function settingsKey(): Buffer {
  let raw = "";
  try {
    raw = SETTINGS_ENCRYPTION_KEY.value();
  } catch {
    raw = "";
  }
  if (!raw && process.env.FUNCTIONS_EMULATOR === "true") raw = EMULATOR_KEY;
  return parseKey(raw);
}

/** Clé secrète Stripe de la plateforme (« unset » tant que les paiements ne sont pas activés). */
export const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");

/** Secret de signature du webhook Connect, créé par bootstrap-firebase.ts. */
export const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

/** Clé Stripe utilisable, ou null (paiements non activés sur la plateforme). */
export function stripeKey(): string | null {
  try {
    const key = STRIPE_SECRET_KEY.value();
    return key && key !== "unset" ? key : null;
  } catch {
    return null;
  }
}
