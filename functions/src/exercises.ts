import { FieldValue } from "firebase-admin/firestore";
import type { FeedbackDoc, SubmissionDoc } from "@shared/exercises";
import { routes } from "@shared/paths";
import { schoolAdminSet } from "@shared/school";
import type { CreatorDoc } from "@shared/types";
import { db } from "./db";

/**
 * Exercices rendus : notifications in-app (jamais d'email) à l'équipe de l'école et à l'élève.
 * IDs déterministes : un déclencheur rejoué est sans effet.
 */

const excerpt = (text: string) => (text.length > 140 ? `${text.slice(0, 140)}…` : text);

async function schoolAdmins(creatorId: string): Promise<Set<string>> {
  const creator = (await db().doc(`creators/${creatorId}`).get()).data() as CreatorDoc | undefined;
  return schoolAdminSet(creatorId, creator);
}

/** Nouvel exercice rendu : chaque administrateur de l'école est prévenu. */
export async function handleNewSubmission(id: string, submission: SubmissionDoc): Promise<void> {
  const admins = await schoolAdmins(submission.creatorId);
  admins.delete(submission.uid);
  const batch = db().batch();
  for (const uid of admins) {
    batch.set(db().doc(`users/${uid}/notifications/submission_${id}`), {
      type: "new_submission",
      title: `${submission.studentName} a rendu l'exercice « ${submission.lessonTitle} »`,
      body: excerpt(submission.note || submission.file?.name || submission.link || ""),
      link: routes.adminSubmission(id),
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

/**
 * Nouveau retour : l'élève est prévenu d'un retour de l'équipe, l'équipe d'une réponse de
 * l'élève. La date du dernier retour est gardée sur l'exercice.
 */
export async function handleNewFeedback(
  submissionId: string,
  feedbackId: string,
  feedback: FeedbackDoc,
): Promise<void> {
  const submissionRef = db().doc(`submissions/${submissionId}`);
  const submission = (await submissionRef.get()).data() as SubmissionDoc | undefined;
  if (!submission) return;
  const batch = db().batch();
  batch.update(submissionRef, { lastFeedbackAt: FieldValue.serverTimestamp() });
  const notification = {
    body: excerpt(feedback.body),
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  };
  if (feedback.authorUid !== submission.uid) {
    batch.set(db().doc(`users/${submission.uid}/notifications/feedback_${feedbackId}`), {
      ...notification,
      type: "submission_feedback",
      title: `Nouveau retour de ${feedback.authorName} sur ton exercice « ${submission.lessonTitle} »`,
      link: `${routes.lesson(submission.courseId, submission.lessonId)}#exercice`,
    });
  } else {
    const admins = await schoolAdmins(submission.creatorId);
    admins.delete(submission.uid);
    for (const uid of admins) {
      batch.set(db().doc(`users/${uid}/notifications/feedback_${feedbackId}`), {
        ...notification,
        type: "submission_feedback",
        title: `${feedback.authorName} a répondu sur l'exercice « ${submission.lessonTitle} »`,
        link: routes.adminSubmission(submissionId),
      });
    }
  }
  await batch.commit();
}

/** Exercice marqué corrigé : l'élève est prévenu (une fois par correction). */
export async function handleSubmissionReviewed(
  submissionId: string,
  before: SubmissionDoc | undefined,
  after: SubmissionDoc | undefined,
): Promise<void> {
  if (!after || after.status !== "reviewed" || before?.status === "reviewed") return;
  await db()
    .doc(`users/${after.uid}/notifications/reviewed_${submissionId}`)
    .set({
      type: "submission_feedback",
      title: `Ton exercice « ${after.lessonTitle} » est corrigé`,
      body: "Retrouve les retours de ton formateur sous la leçon.",
      link: `${routes.lesson(after.courseId, after.lessonId)}#exercice`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
}
