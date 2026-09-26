import type { Auth } from "firebase-admin/auth";
import { FieldValue, type Firestore } from "firebase-admin/firestore";

/**
 * Propriétaire d'une école : fiche membre « owner », adminUids et custom claims
 * (`creator`, `schools`). Idempotent. Même logique que ensureSchoolOwner (functions/src/schools.ts),
 * dupliquée car les scripts utilisent leur propre instance de l'Admin SDK.
 */
export async function ensureSchoolOwner(auth: Auth, db: Firestore, schoolId: string) {
  const user = await auth.getUser(schoolId);
  const memberRef = db.doc(`creators/${schoolId}/members/${schoolId}`);
  if (!(await memberRef.get()).exists) {
    await memberRef.set({
      role: "owner",
      email: user.email ?? "",
      displayName: user.displayName ?? null,
      addedAt: FieldValue.serverTimestamp(),
    });
  }
  await db.doc(`creators/${schoolId}`).update({ adminUids: FieldValue.arrayUnion(schoolId) });

  const claims = { ...(user.customClaims ?? {}) };
  const schools = Array.isArray(claims.schools) ? (claims.schools as string[]) : [];
  if (!schools.includes(schoolId) || claims.creator !== true) {
    await auth.setCustomUserClaims(schoolId, {
      ...claims,
      creator: true,
      schools: [...new Set([...schools, schoolId])],
    });
    const userRef = db.doc(`users/${schoolId}`);
    if ((await userRef.get()).exists) {
      await userRef.update({ claimsUpdatedAt: FieldValue.serverTimestamp() });
    }
  }
}
