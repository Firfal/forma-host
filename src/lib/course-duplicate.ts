import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { DEFAULT_WELCOME_EMAIL } from "@shared/constants";
import type { QuizKeyDoc } from "@shared/quiz";
import type { CoursePrivateSettings, LessonDoc } from "@shared/types";
import { uniqueCourseSlug, type CourseWithId } from "./courses";
import { db } from "./firebase/client";

/** Leçons par lot (jusqu'à 2 écritures chacune, limite Firestore : 500). */
const BATCH_SIZE = 200;

/**
 * Duplique une formation en brouillon : plan, leçons (vidéos, textes, liens, pièces jointes),
 * quiz, page de vente et réglages. Sans élèves, prix ni codes promo. Retourne l'identifiant créé.
 */
export async function duplicateCourse(course: CourseWithId): Promise<string> {
  const [lessons, settings, quizKeys] = await Promise.all([
    // Filtre sur l'école : les règles de lecture des leçons l'exigent pour une requête.
    getDocs(
      query(
        collection(db, "courses", course.id, "lessons"),
        where("creatorId", "==", course.creatorId),
      ),
    ),
    getDoc(doc(db, "courses", course.id, "private", "settings")),
    getDocs(collection(db, "courses", course.id, "quizKeys")),
  ]);
  const keys = new Map(quizKeys.docs.map((key) => [key.id, key.data() as QuizKeyDoc]));
  const title = `${course.title} (copie)`.slice(0, 200);
  const courseRef = doc(collection(db, "courses"));
  // La formation d'abord : les règles des leçons vérifient qu'elle existe.
  await setDoc(courseRef, {
    creatorId: course.creatorId,
    title,
    slug: await uniqueCourseSlug(course.creatorId, title),
    description: course.description,
    summary: course.summary,
    thumbnailUrl: course.thumbnailUrl,
    status: "draft",
    visibility: course.visibility,
    commentsMode: course.commentsMode,
    items: course.items,
    outlineVersion: 0,
    salesPage: course.salesPage,
    price: null,
    ...(course.certificate === false ? { certificate: false } : {}),
    ...(course.drip ? { drip: course.drip } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const docs = lessons.docs;
  for (let start = 0; start < docs.length; start += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const lesson of docs.slice(start, start + BATCH_SIZE)) {
      const data = lesson.data() as LessonDoc;
      batch.set(doc(db, "courses", courseRef.id, "lessons", lesson.id), {
        creatorId: course.creatorId,
        courseId: courseRef.id,
        courseStatus: "draft",
        isPreview: data.isPreview,
        title: data.title,
        video: data.video,
        thumbnailUrl: data.thumbnailUrl,
        body: data.body,
        links: data.links,
        attachments: data.attachments,
        ...(data.quiz ? { quiz: data.quiz } : {}),
        ...(data.exercise ? { exercise: data.exercise } : {}),
        updatedAt: serverTimestamp(),
      });
      const key = keys.get(lesson.id);
      if (data.quiz && key) {
        batch.set(doc(db, "courses", courseRef.id, "quizKeys", lesson.id), {
          creatorId: course.creatorId,
          courseId: courseRef.id,
          answers: key.answers,
          explanations: key.explanations,
          updatedAt: serverTimestamp(),
        });
      }
    }
    await batch.commit();
  }
  const current = settings.data() as CoursePrivateSettings | undefined;
  await setDoc(doc(db, "courses", courseRef.id, "private", "settings"), {
    welcomeEmail: current?.welcomeEmail ?? DEFAULT_WELCOME_EMAIL,
    externalCtaUrl: current?.externalCtaUrl ?? null,
  } satisfies CoursePrivateSettings);
  return courseRef.id;
}
