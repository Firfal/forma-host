import { FieldValue } from "firebase-admin/firestore";
import {
  salesSettingsOf,
  type SalesSettings,
  type SalesSettingsInput,
} from "@shared/sales-settings";
import { db } from "./db";

const ref = (schoolId: string) => db().doc(`creators/${schoolId}/private/sales`);

/** Réglages de vente de l'école (valeurs par défaut s'ils n'ont jamais été enregistrés). */
export async function readSalesSettings(schoolId: string): Promise<SalesSettings> {
  return salesSettingsOf((await ref(schoolId).get()).data() as Partial<SalesSettings> | undefined);
}

export async function saveSalesSettings(
  schoolId: string,
  input: SalesSettingsInput,
): Promise<void> {
  await ref(schoolId).set({ ...input, updatedAt: FieldValue.serverTimestamp() });
}
