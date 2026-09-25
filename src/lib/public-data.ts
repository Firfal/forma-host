import "server-only";
import { cache } from "react";
import type { CourseDoc, CoursePrivateSettings, CreatorDoc, LessonDoc } from "@shared/types";
import { adminDb } from "./firebase/admin";

export type PublicCreator = CreatorDoc & { id: string };
export type PublicCourse = CourseDoc & { id: string };

/** Données publiques : formations publiées uniquement (l'Admin SDK ignore les règles). */

export const getCreatorBySlug = cache(async (slug: string): Promise<PublicCreator | null> => {
  const snap = await adminDb.collection("creators").where("slug", "==", slug).limit(1).get();
  const doc = snap.docs[0];
  return doc ? ({ id: doc.id, ...(doc.data() as CreatorDoc) } as PublicCreator) : null;
});

export const getPublishedCourse = cache(
  async (creatorId: string, slug: string): Promise<PublicCourse | null> => {
    const snap = await adminDb
      .collection("courses")
      .where("creatorId", "==", creatorId)
      .where("slug", "==", slug)
      .where("status", "==", "published")
      .limit(1)
      .get();
    const doc = snap.docs[0];
    return doc ? ({ id: doc.id, ...(doc.data() as CourseDoc) } as PublicCourse) : null;
  },
);

export async function getPublishedCourses(creatorId: string): Promise<PublicCourse[]> {
  const snap = await adminDb
    .collection("courses")
    .where("creatorId", "==", creatorId)
    .where("status", "==", "published")
    .get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as CourseDoc) }) as PublicCourse)
    .filter((course) => course.visibility === "visible");
}

/** Lien de paiement externe (V1) : seul champ des réglages privés exposé publiquement. */
export async function getExternalCtaUrl(courseId: string): Promise<string | null> {
  const snap = await adminDb.doc(`courses/${courseId}/private/settings`).get();
  const url = (snap.data() as CoursePrivateSettings | undefined)?.externalCtaUrl ?? null;
  return url && /^https?:\/\//.test(url) ? url : null;
}

/** Vidéo de la première leçon en aperçu gratuit (bande-annonce). */
export async function getPreviewVideo(course: PublicCourse) {
  const preview = course.items.find(
    (item) => item.kind === "lesson" && item.isPreview && !item.hidden,
  );
  if (!preview) return null;
  const snap = await adminDb.doc(`courses/${course.id}/lessons/${preview.id}`).get();
  const lesson = snap.data() as LessonDoc | undefined;
  return lesson?.video ? { lessonTitle: preview.title, video: lesson.video } : null;
}
