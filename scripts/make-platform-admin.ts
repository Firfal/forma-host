/**
 * Donne le rôle d'administrateur de la plateforme (validation des demandes d'espace formateur).
 *
 *   npx tsx scripts/make-platform-admin.ts --project forma-host --email <email>
 *   npx tsx scripts/make-platform-admin.ts --emulators --email theo@ecolemotion.com
 */
import { FieldValue } from "firebase-admin/firestore";
import { initAdmin, parseArgs } from "./admin";

async function main() {
  const args = parseArgs();
  const email = typeof args.email === "string" ? args.email.toLowerCase() : null;
  if (!email) throw new Error("Usage : --email <email> [--emulators | --project <id>]");
  const { auth, db, projectId } = initAdmin(args);
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), platformAdmin: true });
  await db.doc(`platformAdmins/${user.uid}`).set({
    email,
    addedAt: FieldValue.serverTimestamp(),
  });
  const userRef = db.doc(`users/${user.uid}`);
  if ((await userRef.get()).exists) {
    await userRef.update({ claimsUpdatedAt: FieldValue.serverTimestamp() });
  }
  console.log(`✔ Administrateur de la plateforme sur ${projectId} (compte ${user.uid}).`);
}

main().catch((error) => {
  console.error(`✘ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
