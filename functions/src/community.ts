import { FieldValue } from "firebase-admin/firestore";
import type { CommunityPostDoc, CommunityReplyDoc } from "@shared/community";
import { routes } from "@shared/paths";
import { schoolAdminSet } from "@shared/school";
import type { CreatorDoc, EnrollmentDoc } from "@shared/types";
import { db } from "./db";

/**
 * Communauté d'école : membres tenus à jour d'après les inscriptions actives, compteurs de
 * réponses et notifications in-app (jamais d'email).
 */

const excerpt = (text: string) => (text.length > 140 ? `${text.slice(0, 140)}…` : text);
const BATCH = 400;

/** Élève membre de la communauté tant qu'il a au moins une inscription active dans l'école. */
export async function syncCommunityMember(schoolId: string, uid: string): Promise<void> {
  const community = await db().doc(`communities/${schoolId}`).get();
  if (!community.exists) return;
  const active = await db()
    .collection("enrollments")
    .where("creatorId", "==", schoolId)
    .where("uid", "==", uid)
    .where("status", "==", "active")
    .limit(1)
    .get();
  const ref = db().doc(`communities/${schoolId}/people/${uid}`);
  if (active.empty) await ref.delete();
  else await ref.set({ uid, joinedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/** Inscription créée, révoquée ou supprimée : l'adhésion suit. */
export async function handleEnrollmentWritten(
  before: EnrollmentDoc | undefined,
  after: EnrollmentDoc | undefined,
): Promise<void> {
  const enrollment = after ?? before;
  if (!enrollment) return;
  if (before && after && before.status === after.status) return;
  await syncCommunityMember(enrollment.creatorId, enrollment.uid);
}

/** Active (et remplit avec les élèves actuels) ou désactive la communauté de l'école. */
export async function setCommunityEnabled(schoolId: string, enabled: boolean): Promise<void> {
  await db()
    .doc(`communities/${schoolId}`)
    .set({ enabled, updatedAt: FieldValue.serverTimestamp() });
  if (!enabled) return;
  const enrollments = await db()
    .collection("enrollments")
    .where("creatorId", "==", schoolId)
    .where("status", "==", "active")
    .select("uid")
    .get();
  const uids = [...new Set(enrollments.docs.map((doc) => doc.get("uid") as string))];
  for (let start = 0; start < uids.length; start += BATCH) {
    const batch = db().batch();
    for (const uid of uids.slice(start, start + BATCH)) {
      batch.set(
        db().doc(`communities/${schoolId}/people/${uid}`),
        { uid, joinedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    await batch.commit();
  }
}

async function schoolAdmins(schoolId: string): Promise<Set<string>> {
  const creator = (await db().doc(`creators/${schoolId}`).get()).data() as CreatorDoc | undefined;
  return schoolAdminSet(schoolId, creator);
}

/** Nouveau message d'un élève : l'équipe de l'école est prévenue. */
export async function handleNewPost(
  schoolId: string,
  postId: string,
  post: CommunityPostDoc,
): Promise<void> {
  const admins = await schoolAdmins(schoolId);
  if (admins.has(post.authorUid)) return;
  const batch = db().batch();
  for (const uid of admins) {
    batch.set(db().doc(`users/${uid}/notifications/community_${postId}`), {
      type: "community_post",
      title: `${post.authorName} a écrit dans la communauté`,
      body: excerpt(post.body),
      link: `${routes.adminCommunity}#post-${postId}`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

/** Nouvelle réponse : compteur du message, et son auteur est prévenu. */
export async function handleNewReply(
  schoolId: string,
  postId: string,
  replyId: string,
  reply: CommunityReplyDoc,
): Promise<void> {
  const postRef = db().doc(`communities/${schoolId}/posts/${postId}`);
  const post = (await postRef.get()).data() as CommunityPostDoc | undefined;
  if (!post) return;
  const batch = db().batch();
  batch.update(postRef, {
    replyCount: FieldValue.increment(1),
    lastReplyAt: FieldValue.serverTimestamp(),
  });
  if (post.authorUid !== reply.authorUid) {
    const admins = await schoolAdmins(schoolId);
    batch.set(db().doc(`users/${post.authorUid}/notifications/community_reply_${replyId}`), {
      type: "community_reply",
      title: `${reply.authorName} a répondu à ton message`,
      body: excerpt(reply.body),
      link: `${admins.has(post.authorUid) ? routes.adminCommunity : routes.community(schoolId)}#post-${postId}`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function handleReplyDeleted(schoolId: string, postId: string): Promise<void> {
  const postRef = db().doc(`communities/${schoolId}/posts/${postId}`);
  const post = await postRef.get();
  if (!post.exists) return;
  await postRef.update({ replyCount: FieldValue.increment(-1) });
}

/** Message supprimé : ses réponses aussi. */
export async function handlePostDeleted(schoolId: string, postId: string): Promise<void> {
  await db().recursiveDelete(db().collection(`communities/${schoolId}/posts/${postId}/replies`));
}
