import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  conversationId as buildConversationId,
  messageExcerpt,
  type ConversationDoc,
  type MessageDoc,
  type OpenConversationInput,
  type UpdateConversationInput,
} from "@shared/chat";
import { paths, routes } from "@shared/paths";
import type { CreatorDoc, EnrollmentDoc, ProfileDoc, UserDoc } from "@shared/types";
import { db } from "./db";
import { schoolBaseUrl } from "./domains";
import type { Caller } from "./guards";
import { brandFromCreator, buildMessageEmail } from "./mail";
import { schoolAdminUids } from "./school-admins";

export class ChatError extends Error {}

async function schoolEnrollments(schoolId: string, studentUid: string) {
  const snap = await db()
    .collection("enrollments")
    .where("creatorId", "==", schoolId)
    .where("uid", "==", studentUid)
    .get();
  return snap.docs.map((doc) => doc.data() as EnrollmentDoc<Timestamp>);
}

/**
 * Ouvre (ou retrouve) la conversation entre une école et un élève.
 * - Élève : il doit être inscrit (accès actif) à une formation de l'école.
 * - Équipe de l'école : l'élève doit avoir été inscrit à l'une de ses formations.
 */
export async function openConversation(
  caller: Caller,
  input: OpenConversationInput,
): Promise<{ conversationId: string }> {
  const { schoolId } = input;
  const isStaff = caller.schools.includes(schoolId);
  const studentUid = input.studentUid ?? caller.uid;
  if (studentUid === caller.uid && isStaff) {
    throw new ChatError("Tu fais partie de l'équipe de cette école.");
  }
  if (studentUid !== caller.uid && !isStaff) {
    throw new ChatError("Seule l'équipe de l'école peut écrire à un élève.");
  }

  const enrollments = await schoolEnrollments(schoolId, studentUid);
  const allowed = isStaff
    ? enrollments.length > 0
    : enrollments.some((enrollment) => enrollment.status === "active");
  if (!allowed) {
    throw new ChatError(
      isStaff
        ? "Cette personne n'est inscrite à aucune formation de l'école."
        : "Tu n'as accès à aucune formation de cette école.",
    );
  }

  const id = buildConversationId(schoolId, studentUid);
  const ref = db().doc(paths.conversation(id));
  if ((await ref.get()).exists) return { conversationId: id };

  const [creatorSnap, profileSnap] = await Promise.all([
    db().doc(`creators/${schoolId}`).get(),
    db().doc(`profiles/${studentUid}`).get(),
  ]);
  const creator = creatorSnap.data() as CreatorDoc | undefined;
  const profile = profileSnap.data() as ProfileDoc | undefined;
  const email = enrollments.find((enrollment) => enrollment.email)?.email ?? null;
  const name =
    profile?.displayName ||
    enrollments.find((enrollment) => enrollment.displayName)?.displayName ||
    email ||
    "Élève";
  const since = enrollments
    .map((enrollment) => enrollment.joinedAt)
    .filter((value): value is Timestamp => value instanceof Timestamp)
    .sort((a, b) => a.toMillis() - b.toMillis())[0];

  const conversation: ConversationDoc<Timestamp | FieldValue> = {
    schoolId,
    schoolName: creator?.name ?? "École",
    studentUid,
    studentName: name,
    studentEmail: email,
    studentSince: since ?? null,
    lastMessage: null,
    lastMessageId: null,
    lastAt: FieldValue.serverTimestamp(),
    unreadForSchool: 0,
    unreadForStudent: 0,
    archived: false,
    blocked: false,
    mutedBy: [],
    createdAt: FieldValue.serverTimestamp(),
  };
  // create échoue si la conversation vient d'être créée en parallèle : elle existe, c'est le but.
  await ref.create(conversation).catch((error: { code?: number }) => {
    if (error.code !== 6) throw error;
  });
  return { conversationId: id };
}

/** Archivage et blocage (équipe) ; sourdine (chaque participant, pour lui-même). */
export async function updateConversation(
  caller: Caller,
  input: UpdateConversationInput,
): Promise<void> {
  const ref = db().doc(paths.conversation(input.conversationId));
  const conversation = (await ref.get()).data() as ConversationDoc | undefined;
  if (!conversation) throw new ChatError("Conversation introuvable.");
  const isStaff = caller.schools.includes(conversation.schoolId);
  if (!isStaff && caller.uid !== conversation.studentUid) {
    throw new ChatError("Conversation introuvable.");
  }

  const update: Record<string, unknown> = {};
  if (input.archived != null || input.blocked != null) {
    if (!isStaff) throw new ChatError("Réservé à l'équipe de l'école.");
    if (input.archived != null) update.archived = input.archived;
    if (input.blocked != null) update.blocked = input.blocked;
  }
  if (input.muted != null) {
    update.mutedBy = input.muted
      ? FieldValue.arrayUnion(caller.uid)
      : FieldValue.arrayRemove(caller.uid);
  }
  if (Object.keys(update).length) await ref.update(update);
}

/**
 * Nouveau message : aperçu et compteurs de la conversation, notification (qui part aussi en push)
 * pour l'autre côté ; email à l'élève pour le premier message non lu de l'école.
 * Une notification par conversation : elle est réémise (createdAt) à chaque message.
 */
export async function handleNewMessage(
  id: string,
  messageId: string,
  message: MessageDoc,
  appUrl: string,
): Promise<void> {
  const ref = db().doc(paths.conversation(id));
  const result = await db().runTransaction(async (tx) => {
    const conversation = (await tx.get(ref)).data() as ConversationDoc | undefined;
    // Déclencheur rejoué : le message a déjà été pris en compte.
    if (!conversation || conversation.lastMessageId === messageId) return null;
    const fromStudent = message.authorUid === conversation.studentUid;
    tx.update(ref, {
      lastMessage: { body: messageExcerpt(message.body), authorUid: message.authorUid },
      lastMessageId: messageId,
      lastAt: message.createdAt ?? FieldValue.serverTimestamp(),
      ...(fromStudent
        ? { unreadForSchool: FieldValue.increment(1), archived: false }
        : { unreadForStudent: FieldValue.increment(1) }),
    });
    return { conversation, fromStudent };
  });
  if (!result) return;

  const { conversation, fromStudent } = result;
  const muted = new Set(conversation.mutedBy ?? []);
  const recipients = (
    fromStudent ? await schoolAdminUids(conversation.schoolId) : [conversation.studentUid]
  ).filter((uid) => uid !== message.authorUid && !muted.has(uid));
  if (!recipients.length) return;

  const excerpt = messageExcerpt(message.body);
  const link = fromStudent ? routes.adminConversation(id) : routes.conversation(id);
  const batch = db().batch();
  for (const uid of recipients) {
    batch.set(db().doc(`users/${uid}/notifications/message_${id}`), {
      type: "new_message",
      title: `Message de ${fromStudent ? conversation.studentName : conversation.schoolName}`,
      body: fromStudent ? excerpt : `${message.authorName} : ${excerpt}`,
      link,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  // Email à l'élève seulement pour le premier message non lu : pas un email par message.
  if (!fromStudent && conversation.unreadForStudent === 0) {
    const [creatorSnap, userSnap] = await Promise.all([
      db().doc(`creators/${conversation.schoolId}`).get(),
      db().doc(`users/${conversation.studentUid}`).get(),
    ]);
    const to = (userSnap.data() as UserDoc | undefined)?.email ?? conversation.studentEmail;
    if (to) {
      const baseUrl = await schoolBaseUrl(conversation.schoolId, appUrl);
      batch.set(
        db().doc(paths.mail(`message_${messageId}`)),
        buildMessageEmail({
          creatorId: conversation.schoolId,
          to,
          studentName: conversation.studentName,
          authorName: message.authorName,
          excerpt,
          brand: brandFromCreator(creatorSnap.data() as CreatorDoc | undefined),
          ctaUrl: `${baseUrl}${link}`,
        }),
      );
    }
  }
  await batch.commit();
}
