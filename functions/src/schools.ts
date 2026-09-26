import { FieldValue } from "firebase-admin/firestore";
import { paths, routes } from "@shared/paths";
import { nextPreviousSlugs, schoolsFromClaims, type SchoolProfileInput } from "@shared/school";
import type { CreatorDoc, SchoolMemberDoc } from "@shared/types";
import { getOrCreateUser, inviteDoc, needsActivation, newInviteToken } from "./access";
import { auth, db } from "./db";
import { brandFromCreator, buildMemberInviteEmail } from "./mail";

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

/**
 * Ajoute ou retire une école des custom claims (`schools`, `creator`). Le client recharge
 * son jeton quand users/{uid}.claimsUpdatedAt change.
 */
export async function updateSchoolClaims(
  uid: string,
  change: { add?: string; remove?: string },
): Promise<void> {
  const user = await auth().getUser(uid);
  const claims = { ...(user.customClaims ?? {}) };
  const schools = new Set(schoolsFromClaims(uid, claims));
  if (change.add) schools.add(change.add);
  if (change.remove) schools.delete(change.remove);
  claims.schools = [...schools];
  claims.creator = schools.size > 0;
  await auth().setCustomUserClaims(uid, claims);

  const userRef = db().doc(`users/${uid}`);
  if ((await userRef.get()).exists) {
    await userRef.update({ claimsUpdatedAt: FieldValue.serverTimestamp() });
  } else {
    await userRef.set({
      email: user.email ?? "",
      notifyOnComment: true,
      createdAt: FieldValue.serverTimestamp(),
      claimsUpdatedAt: FieldValue.serverTimestamp(),
    });
  }
}

/** Fiche « owner », adminUids et claims du propriétaire (idempotent : migration, nouveaux formateurs). */
export async function ensureSchoolOwner(schoolId: string): Promise<void> {
  const user = await auth().getUser(schoolId);
  const memberRef = db().doc(paths.creatorMember(schoolId, schoolId));
  if (!(await memberRef.get()).exists) {
    await memberRef.set({
      role: "owner",
      email: user.email ?? "",
      displayName: user.displayName ?? null,
      addedAt: FieldValue.serverTimestamp(),
    } satisfies SchoolMemberDoc<FieldValue>);
  }
  await db()
    .doc(`creators/${schoolId}`)
    .update({ adminUids: FieldValue.arrayUnion(schoolId) });
  const claimed = user.customClaims?.schools;
  if (!Array.isArray(claimed) || !claimed.includes(schoolId)) {
    await updateSchoolClaims(schoolId, { add: schoolId });
  }
}

/** Invite un co-administrateur (compte créé si besoin, email d'invitation via le SMTP de l'école). */
export async function inviteSchoolAdmin(params: {
  schoolId: string;
  email: string;
  inviterName: string;
  appUrl: string;
}): Promise<{ uid: string; activation: boolean }> {
  const { schoolId, email } = params;
  const creatorSnap = await db().doc(`creators/${schoolId}`).get();
  const creator = creatorSnap.data() as CreatorDoc | undefined;
  if (!creator) throw new SchoolError("École introuvable");

  const user = await getOrCreateUser(email);
  if (user.uid === schoolId) throw new SchoolError("Tu es déjà propriétaire de cette école.");
  const memberRef = db().doc(paths.creatorMember(schoolId, user.uid));
  if ((await memberRef.get()).exists) throw new SchoolError("Déjà membre de l'équipe.");

  const activation = needsActivation(user);
  const batch = db().batch();
  batch.create(memberRef, {
    role: "admin",
    email,
    displayName: user.displayName ?? null,
    addedAt: FieldValue.serverTimestamp(),
  } satisfies SchoolMemberDoc<FieldValue>);
  batch.update(creatorSnap.ref, { adminUids: FieldValue.arrayUnion(user.uid) });

  const profileRef = db().doc(`profiles/${user.uid}`);
  if (!(await profileRef.get()).exists) {
    batch.set(profileRef, {
      displayName: user.displayName || email.split("@")[0],
      avatarUrl: null,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  let ctaUrl = `${params.appUrl}${routes.admin}`;
  if (activation) {
    const token = newInviteToken();
    batch.create(
      db().doc(`invites/${token}`),
      inviteDoc(user.uid, email, null, schoolId, "member"),
    );
    ctaUrl = `${params.appUrl}${routes.welcome(token)}`;
  } else {
    batch.set(db().doc(`users/${user.uid}/notifications/member_${schoolId}`), {
      type: "new_student",
      title: `Tu fais partie de l'équipe de « ${creator.name} »`,
      body: `${params.inviterName} t'a ajouté comme administrateur.`,
      link: routes.admin,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  batch.create(
    db().doc(`mail/member_${schoolId}_${user.uid}_${Date.now()}`),
    buildMemberInviteEmail({
      creatorId: schoolId,
      to: email,
      schoolName: creator.name,
      inviterName: params.inviterName,
      brand: brandFromCreator(creator),
      ctaUrl,
      activation,
    }),
  );
  await batch.commit();
  await updateSchoolClaims(user.uid, { add: schoolId });
  return { uid: user.uid, activation };
}

/** Retire un co-administrateur de l'équipe (le propriétaire ne peut pas être retiré). */
export async function removeSchoolAdmin(schoolId: string, uid: string): Promise<void> {
  if (uid === schoolId) throw new SchoolError("Le propriétaire ne peut pas être retiré.");
  const memberRef = db().doc(paths.creatorMember(schoolId, uid));
  if (!(await memberRef.get()).exists) throw new SchoolError("Membre introuvable.");
  const batch = db().batch();
  batch.delete(memberRef);
  batch.update(db().doc(`creators/${schoolId}`), { adminUids: FieldValue.arrayRemove(uid) });
  await batch.commit();
  await updateSchoolClaims(uid, { remove: schoolId });
}
