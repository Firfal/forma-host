import { FieldValue } from "firebase-admin/firestore";
import { routes } from "@shared/paths";
import { schoolAdminSet } from "@shared/school";
import { escapeHtml, emailLayout } from "@shared/template";
import type { CommentDoc, CourseDoc, CreatorDoc, UserDoc } from "@shared/types";
import { db } from "./db";
import { brandFromCreator, mailDoc } from "./mail";

/**
 * À la création d'un commentaire : notifie l'équipe de l'école (et par email si activé)
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

  const creatorSnap = await db().doc(`creators/${course.creatorId}`).get();
  const creator = creatorSnap.data() as CreatorDoc | undefined;
  const admins = schoolAdminSet(course.creatorId, creator);

  // Commentaire d'un élève : notification (et email si activé) à chaque administrateur.
  if (!admins.has(comment.authorUid)) {
    const brand = brandFromCreator(creator);
    const subject = `Nouveau commentaire sur « ${lessonTitle} »`;
    const html = emailLayout({
      bodyHtml: `<p style="margin:0 0 16px"><strong>${escapeHtml(comment.authorName)}</strong> a commenté la leçon « ${escapeHtml(lessonTitle)} » :</p><blockquote style="margin:0 0 16px;padding-left:12px;border-left:3px solid #d6d6d7;color:#717073">${escapeHtml(excerpt)}</blockquote>`,
      ctaLabel: "Répondre",
      ctaUrl: `${appUrl}${link}`,
      brandName: brand.name,
      brandColor: brand.color,
      footer: "Désactive ces emails dans Mon compte.",
    });
    const adminUsers = await db().getAll(...[...admins].map((uid) => db().doc(`users/${uid}`)));
    for (const adminUser of adminUsers) {
      batch.set(db().doc(`users/${adminUser.id}/notifications/comment_${commentId}`), {
        type: "new_comment",
        title: `${comment.authorName} a commenté « ${lessonTitle} »`,
        body: excerpt,
        link,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      const data = adminUser.data() as UserDoc | undefined;
      if (data?.email && data.notifyOnComment) {
        batch.set(
          db().doc(`mail/comment_${commentId}_${adminUser.id}`),
          mailDoc({
            creatorId: course.creatorId,
            to: data.email,
            subject,
            html,
            text: `${comment.authorName} : ${excerpt}\n${appUrl}${link}`,
          }),
        );
      }
    }
  }

  if (comment.parentId) {
    const parentSnap = await db().doc(`courses/${courseId}/comments/${comment.parentId}`).get();
    const parent = parentSnap.data() as CommentDoc | undefined;
    if (parent && parent.authorUid !== comment.authorUid && !admins.has(parent.authorUid)) {
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
