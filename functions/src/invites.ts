import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { InviteInfo } from "@shared/schemas";
import type { CourseDoc, CreatorDoc, InviteDoc } from "@shared/types";
import { auth, db } from "./db";

/** Vérifie un jeton d'invitation et retourne les infos affichées sur /bienvenue/[token]. */
export async function readInvite(token: string): Promise<InviteInfo> {
  const snap = await db().doc(`invites/${token}`).get();
  const invite = snap.data() as InviteDoc<Timestamp> | undefined;
  assertUsable(invite);
  const [courseSnap, creatorSnap] = await Promise.all([
    db().doc(`courses/${invite.courseId}`).get(),
    db().doc(`creators/${invite.creatorId}`).get(),
  ]);
  return {
    email: invite.email,
    courseTitle: (courseSnap.data() as CourseDoc | undefined)?.title ?? "",
    creatorName: (creatorSnap.data() as CreatorDoc | undefined)?.name ?? "",
  };
}

function assertUsable(
  invite: InviteDoc<Timestamp> | undefined,
): asserts invite is InviteDoc<Timestamp> {
  if (!invite) throw new HttpsError("not-found", "Invitation introuvable");
  if (invite.usedAt)
    throw new HttpsError(
      "already-exists",
      "Ce lien a déjà servi : connecte-toi avec ton email et ton mot de passe.",
    );
  if (invite.expiresAt.toMillis() < Date.now()) {
    throw new HttpsError(
      "deadline-exceeded",
      "Invitation expirée : demande un nouveau lien au formateur.",
    );
  }
}

/** Active le compte : définit le mot de passe et le nom, puis consomme le jeton. */
export async function acceptInvite(input: {
  token: string;
  password: string;
  displayName: string;
}): Promise<{ email: string }> {
  const ref = db().doc(`invites/${input.token}`);
  const invite = await db().runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() as InviteDoc<Timestamp> | undefined;
    assertUsable(data);
    tx.update(ref, { usedAt: FieldValue.serverTimestamp() });
    tx.set(
      db().doc(`profiles/${data.uid}`),
      { displayName: input.displayName, avatarUrl: null, createdAt: FieldValue.serverTimestamp() },
      { mergeFields: ["displayName"] },
    );
    return data;
  });
  await auth().updateUser(invite.uid, {
    password: input.password,
    displayName: input.displayName,
    emailVerified: true,
  });
  return { email: invite.email };
}
