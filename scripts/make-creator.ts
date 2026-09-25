/**
 * Active le rôle formateur d'un compte (claim `creator`) et crée sa fiche `creators/{uid}`.
 *
 *   npm run make-creator -- --emulators --email theo@ecolemotion.com --name "Ecole Motion" --slug ecole-motion
 *   npm run make-creator -- --project mon-projet --email theo@ecolemotion.com --name "Ecole Motion" --slug ecole-motion
 *
 * Options : --color #9d72f9  --support theo@ecolemotion.com  --password <mdp> (crée le compte s'il n'existe pas)
 */
import { FieldValue } from "firebase-admin/firestore";
import { isReservedSlug, isValidSlug, slugify } from "../shared/slug";
import { initAdmin, parseArgs } from "./admin";

async function main() {
  const args = parseArgs();
  const email = typeof args.email === "string" ? args.email.toLowerCase() : null;
  const name = typeof args.name === "string" ? args.name : null;
  if (!email || !name) {
    throw new Error(
      'Usage : --email <email> --name "<nom de l\'école>" [--slug <slug>] [--emulators | --project <id>]',
    );
  }
  const slug = typeof args.slug === "string" ? args.slug : slugify(name);
  if (!isValidSlug(slug) || isReservedSlug(slug))
    throw new Error(`Slug invalide ou réservé : ${slug}`);

  const { auth, db, projectId } = initAdmin(args);
  let user = await auth.getUserByEmail(email).catch(() => null);
  if (!user) {
    if (typeof args.password !== "string")
      throw new Error("Compte introuvable : ajouter --password pour le créer");
    user = await auth.createUser({
      email,
      password: args.password,
      displayName: name,
      emailVerified: true,
    });
    console.log(`Compte créé : ${email}`);
  }

  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), creator: true });
  const creatorRef = db.doc(`creators/${user.uid}`);
  const existing = await creatorRef.get();
  await creatorRef.set(
    {
      name,
      slug,
      logoUrl: existing.data()?.logoUrl ?? null,
      brandColor:
        typeof args.color === "string" ? args.color : (existing.data()?.brandColor ?? "#9d72f9"),
      supportEmail:
        typeof args.support === "string" ? args.support : (existing.data()?.supportEmail ?? email),
      createdAt: existing.data()?.createdAt ?? FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log(
    `✔ ${email} est formateur sur ${projectId} (creators/${user.uid}, slug « ${slug} »).`,
  );
  console.log("  L'utilisateur doit se reconnecter pour obtenir le rôle.");
}

main().catch((error) => {
  console.error(`✘ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
