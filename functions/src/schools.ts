import { nextPreviousSlugs, type SchoolProfileInput } from "@shared/school";
import type { CreatorDoc } from "@shared/types";
import { db } from "./db";

/** Erreur au message déjà lisible par le formateur. */
export class SchoolError extends Error {}

/**
 * Met à jour le profil public de l'école. Une adresse (slug) ne peut appartenir qu'à une
 * école, y compris parmi les anciennes adresses encore redirigées.
 */
export async function updateSchoolProfile(
  schoolId: string,
  input: SchoolProfileInput,
): Promise<void> {
  const ref = db().doc(`creators/${schoolId}`);
  await db().runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data() as CreatorDoc | undefined;
    if (!current) throw new SchoolError("École introuvable");

    if (input.slug !== current.slug) {
      const [bySlug, byPrevious] = await Promise.all([
        tx.get(db().collection("creators").where("slug", "==", input.slug).limit(2)),
        tx.get(
          db().collection("creators").where("previousSlugs", "array-contains", input.slug).limit(2),
        ),
      ]);
      const taken = [...bySlug.docs, ...byPrevious.docs].some((doc) => doc.id !== schoolId);
      if (taken) throw new SchoolError("Cette adresse est déjà prise, choisis-en une autre.");
    }

    tx.update(ref, {
      name: input.name,
      slug: input.slug,
      previousSlugs: nextPreviousSlugs(current, input.slug),
      logoUrl: input.logoUrl ?? null,
      brandColor: input.brandColor.toLowerCase(),
      supportEmail: input.supportEmail ?? null,
    });
  });
}
