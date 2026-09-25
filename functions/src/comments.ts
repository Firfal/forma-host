import { FieldValue } from "firebase-admin/firestore";
import { routes } from "@shared/paths";
import { escapeHtml, emailLayout } from "@shared/template";
import type { CommentDoc, CourseDoc, CreatorDoc, UserDoc } from "@shared/types";
import { db } from "./db";
import { brandFromCreator, mailDoc } from "./mail";

/**
 * À la création d'un commentaire : notifie le formateur (et par email s'il l'a activé)
 * et l'auteur du commentaire parent. IDs déterministes : un déclencheur rejoué est sans effet.
 */
export async function handleNewComment(
  courseId: string,
  commentId: string,
  comment: CommentDoc,
  appUrl: string,
): Promise<void> {
  const courseSnap = await db().doc(`courses/${courseId}`).get();
  const course = courseSnap.data() as CourseDoc | undefined;
  if (!course) return;

  const lessonTitle =
    course.items.find((item) => item.id === comment.lessonId)?.title ?? "une leçon";
  const link = `${routes.lesson(courseId, comment.lessonId)}#comment-${commentId}`;
  const excerpt = comment.body.length > 140 ? `${comment.body.slice(0, 140)}…` : comment.body;
  const batch = db().batch();

  if (comment.authorUid !== course.creatorId) {
    batch.set(db().doc(`users/${course.creatorId}/notifications/comment_${commentId}`), {
      type: "new_comment",
      title: `${comment.authorName} a commenté « ${lessonTitle} »`,
      body: excerpt,
      link,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    const [creatorUserSnap, creatorSnap] = await Promise.all([
      db().doc(`users/${course.creatorId}`).get(),
      db().doc(`creators/${course.creatorId}`).get(),
    ]);
    const creatorUser = creatorUserSnap.data() as UserDoc | undefined;
    if (creatorUser?.email && creatorUser.notifyOnComment) {
      const brand = brandFromCreator(creatorSnap.data() as CreatorDoc | undefined);
      const subject = `Nouveau commentaire sur « ${lessonTitle} »`;
      const html = emailLayout({
        bodyHtml: `<p style="margin:0 0 16px"><strong>${escapeHtml(comment.authorName)}</strong> a commenté la leçon « ${escapeHtml(lessonTitle)} » :</p><blockquote style="margin:0 0 16px;padding-left:12px;border-left:3px solid #d6d6d7;color:#717073">${escapeHtml(excerpt)}</blockquote>`,
        ctaLabel: "Répondre",
        ctaUrl: `${appUrl}${link}`,
        brandName: brand.name,
        brandColor: brand.color,
        footer: "Désactive ces emails dans Paramètres > Notifications.",
      });
      batch.set(
        db().doc(`mail/comment_${commentId}`),
        mailDoc(
          creatorUser.email,
          subject,
          html,
          `${comment.authorName} : ${excerpt}\n${appUrl}${link}`,
        ),
      );
    }
  }

  if (comment.parentId) {
    const parentSnap = await db().doc(`courses/${courseId}/comments/${comment.parentId}`).get();
    const parent = parentSnap.data() as CommentDoc | undefined;
    if (parent && parent.authorUid !== comment.authorUid && parent.authorUid !== course.creatorId) {
      batch.set(db().doc(`users/${parent.authorUid}/notifications/reply_${commentId}`), {
        type: "comment_reply",
        title: `${comment.authorName} a répondu à ton commentaire`,
        body: excerpt,
        link,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }

  await batch.commit();
}
