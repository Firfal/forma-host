import { FieldValue } from "firebase-admin/firestore";
import type { PublishAnnouncementInput } from "@shared/announcements";
import { routes } from "@shared/paths";
import { emailLayout, escapeHtml } from "@shared/template";
import type { CourseDoc, CreatorDoc, EnrollmentDoc } from "@shared/types";
import { db } from "./db";
import { brandFromCreator, mailDoc } from "./mail";

/** Nombre d'écritures par lot (limite Firestore : 500). */
const BATCH_SIZE = 400;

/**
 * Publie une annonce : document dans la formation, notification (et push) à chaque élève
 * inscrit actif, email seulement si le formateur l'a demandé.
 */
export async function publishAnnouncement(params: {
  input: PublishAnnouncementInput;
  course: CourseDoc;
  authorName: string;
  appUrl: string;
}): Promise<{ id: string; recipients: number }> {
  const { input, course } = params;
  const enrollments = await db()
    .collection("enrollments")
    .where("courseId", "==", input.courseId)
    .where("status", "==", "active")
    .get();
  const students = enrollments.docs.map((doc) => doc.data() as EnrollmentDoc);
  const ref = db().collection(`courses/${input.courseId}/announcements`).doc();
  await ref.set({
    title: input.title,
    body: input.body,
    authorName: params.authorName,
    recipients: students.length,
    emailed: input.sendEmail,
    createdAt: FieldValue.serverTimestamp(),
  });

  const creator = input.sendEmail
    ? ((await db().doc(`creators/${course.creatorId}`).get()).data() as CreatorDoc | undefined)
    : undefined;
  const brand = brandFromCreator(creator);
  const url = `${params.appUrl}${routes.course(input.courseId)}`;
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (let start = 0; start < students.length; start += BATCH_SIZE) {
    const batch = db().batch();
    for (const student of students.slice(start, start + BATCH_SIZE)) {
      batch.set(db().doc(`users/${student.uid}/notifications/announcement_${ref.id}`), {
        type: "announcement",
        title: input.title,
        body: `${course.title} · ${input.body.slice(0, 140)}`,
        link: routes.course(input.courseId),
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      if (input.sendEmail && student.email) {
        batch.set(
          db().doc(`mail/announcement_${ref.id}_${student.uid}`),
          mailDoc({
            creatorId: course.creatorId,
            to: student.email,
            subject: `${input.title} · ${course.title}`,
            html: emailLayout({
              bodyHtml: paragraphs
                .map(
                  (text) =>
                    `<p style="margin:0 0 16px">${escapeHtml(text).replace(/\n/g, "<br>")}</p>`,
                )
                .join(""),
              ctaLabel: "Voir la formation",
              ctaUrl: url,
              brandName: brand.name,
              brandColor: brand.color,
            }),
            text: `${input.body}\n\nVoir la formation : ${url}`,
            replyTo: brand.supportEmail,
          }),
        );
      }
    }
    await batch.commit();
  }
  return { id: ref.id, recipients: students.length };
}
