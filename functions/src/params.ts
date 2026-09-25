import { defineSecret, defineString } from "firebase-functions/params";

/** URL publique de l'application (liens dans les emails). */
export const APP_URL = defineString("APP_URL", { default: "http://localhost:3000" });

/** Token personnel Vimeo (scope « private »), stocké dans Secret Manager. */
export const VIMEO_ACCESS_TOKEN = defineSecret("VIMEO_ACCESS_TOKEN");
