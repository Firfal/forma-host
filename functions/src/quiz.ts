import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { enrollmentId } from "@shared/paths";
import {
  gradeQuiz,
  nextQuizResult,
  type QuizAnswers,
  type QuizGrade,
  type QuizKeyDoc,
  type QuizResult,
} from "@shared/quiz";
import type { CourseDoc, EnrollmentDoc, LessonDoc } from "@shared/types";
import { db } from "./db";

/** Erreur au message déjà lisible par l'élève. */
export class QuizError extends Error {}

/**
 * Corrige une tentative de l'élève et mémorise son meilleur score. Quiz réussi : la leçon est
 * terminée. Les bonnes réponses ne sont renvoyées qu'une fois le quiz réussi.
 */
export async function submitQuiz(params: {
  courseId: string;
  lessonId: string;
  uid: string;
  answers: QuizAnswers;
}): Promise<QuizGrade> {
  const enrollmentRef = db().doc(`enrollments/${enrollmentId(params.courseId, params.uid)}`);
  const courseRef = db().doc(`courses/${params.courseId}`);
  const lessonRef = courseRef.collection("lessons").doc(params.lessonId);
  const keyRef = courseRef.collection("quizKeys").doc(params.lessonId);
  return db().runTransaction(async (tx) => {
    const [enrollmentSnap, courseSnap, lessonSnap, keySnap] = await tx.getAll(
      enrollmentRef,
      courseRef,
      lessonRef,
      keyRef,
    );
    const enrollment = enrollmentSnap.data() as EnrollmentDoc | undefined;
    const course = courseSnap.data() as CourseDoc | undefined;
    if (!enrollment || enrollment.status !== "active" || !course) {
      throw new QuizError("Tu n'es pas inscrit à cette formation.");
    }
    const item = course.items.find((i) => i.id === params.lessonId && i.kind === "lesson");
    const quiz = (lessonSnap.data() as LessonDoc | undefined)?.quiz;
    if (!item || item.hidden || !quiz) throw new QuizError("Cette leçon n'a pas de quiz.");
    const key = keySnap.data() as QuizKeyDoc | undefined;
    if (!key)
      throw new QuizError("Le quiz est en cours de modification, réessaie dans un instant.");

    const grade = gradeQuiz(quiz, key, params.answers);
    const previous = enrollment.quizResults?.[params.lessonId] as QuizResult | undefined;
    const now = FieldValue.serverTimestamp();
    // FieldPath : l'identifiant de leçon est une clé de map, jamais interprété comme un chemin.
    tx.update(
      enrollmentRef,
      new FieldPath("quizResults", params.lessonId),
      nextQuizResult(previous, grade, now),
      "progress.lastLessonId",
      params.lessonId,
      "progress.lastActivityAt",
      now,
      ...(grade.passed
        ? ["progress.completedLessonIds", FieldValue.arrayUnion(params.lessonId)]
        : []),
    );
    return grade;
  });
}

/** Leçons visibles dont le quiz est obligatoire (certificat : il faut les avoir réussis). */
export async function requiredQuizLessonIds(courseId: string, course: CourseDoc) {
  const snap = await db()
    .collection(`courses/${courseId}/lessons`)
    .where("quiz.required", "==", true)
    .select()
    .get();
  const visible = new Set(
    course.items.filter((i) => i.kind === "lesson" && !i.hidden).map((i) => i.id),
  );
  return snap.docs.map((doc) => doc.id).filter((id) => visible.has(id));
}
