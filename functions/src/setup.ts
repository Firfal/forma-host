// Importé en premier par index.ts : initialise l'Admin SDK et les options globales.
import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";
import { REGION } from "@shared/constants";

initializeApp();
setGlobalOptions({ region: REGION, maxInstances: 5 });
