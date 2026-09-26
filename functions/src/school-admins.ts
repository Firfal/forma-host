import { schoolAdminSet } from "@shared/school";
import type { CreatorDoc } from "@shared/types";
import { db } from "./db";

/** Administrateurs de l'école (propriétaire inclus) : destinataires des notifications. */
export async function schoolAdminUids(schoolId: string): Promise<string[]> {
  const creator = (await db().doc(`creators/${schoolId}`).get()).data() as CreatorDoc | undefined;
  return [...schoolAdminSet(schoolId, creator)];
}
