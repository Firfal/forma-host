import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { certificateEnabled, isCourseCompleted } from "@shared/certificates";
import { visibleLessons } from "@shared/outline";
import { enrollmentId } from "@shared/paths";
import { missingRequiredQuizzes } from "@shared/quiz";
import type { CourseDoc, CreatorDoc, EnrollmentDoc } from "@shared/types";
import { db } from "./db";
import { requiredQuizLessonIds } from "./quiz";

/** Erreur au message déjà lisible par l'élève. */
export class CertificateError extends Error {}

/**
 * Certificat de réussite de l'élève (idempotent : un seul par formation, le nom imprimé peut
 * être corrigé). Vérifie côté serveur que toutes les leçons visibles sont terminées et les quiz
 * obligatoires réussis.
 */
export async function issueCertificate(params: {
  courseId: string;
  uid: string;
  name: string;
}): Promise<string> {
  const enrollmentRef = db().doc(`enrollments/${enrollmentId(params.courseId, params.uid)}`);
  const [enrollmentSnap, courseSnap] = await Promise.all([
    enrollmentRef.get(),
    db().doc(`courses/${params.courseId}`).get(),
  ]);
  const enrollment = enrollmentSnap.data() as
    (EnrollmentDoc & { certificateId?: string }) | undefined;
  const course = courseSnap.data() as CourseDoc | undefined;
  if (!enrollment || enrollment.status !== "active" || !course) {
    throw new CertificateError("Tu n'es pas inscrit à cette formation.");
  }
  if (!certificateEnabled(course)) {
    throw new CertificateError("Cette formation ne délivre pas de certificat.");
  }
  if (!isCourseCompleted(course.items, enrollment.progress.completedLessonIds)) {
    throw new CertificateError("Termine toutes les leçons pour obtenir ton certificat.");
  }
  const missing = missingRequiredQuizzes(
    await requiredQuizLessonIds(params.courseId, course),
    enrollment.quizResults,
  );
  if (missing.length) {
    const titles = missing.map((id) => course.items.find((i) => i.id === id)?.title ?? id);
    throw new CertificateError(
      `Réussis le quiz ${titles.map((title) => `« ${title} »`).join(", ")} pour obtenir ton certificat.`,
    );
  }
  if (enrollment.certificateId) {
    await db().doc(`certificates/${enrollment.certificateId}`).update({ studentName: params.name });
    return enrollment.certificateId;
  }
  const creator = (await db().doc(`creators/${course.creatorId}`).get()).data() as
    CreatorDoc | undefined;
  const lessons = visibleLessons(course.items);
  const id = randomBytes(12).toString("base64url");
  const batch = db().batch();
  batch.set(db().doc(`certificates/${id}`), {
    courseId: params.courseId,
    courseTitle: course.title,
    schoolId: course.creatorId,
    schoolName: creator?.name ?? "",
    studentUid: params.uid,
    studentName: params.name,
    lessonCount: lessons.length,
    durationSec: lessons.reduce((sum, lesson) => sum + (lesson.durationSec ?? 0), 0),
    issuedAt: FieldValue.serverTimestamp(),
  });
  batch.update(enrollmentRef, { certificateId: id });
  await batch.commit();
  return id;
}
