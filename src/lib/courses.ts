import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { DEFAULT_WELCOME_EMAIL } from "@shared/constants";
import { isReservedSlug, slugify } from "@shared/slug";
import type {
  CourseDoc,
  CoursePrivateSettings,
  CourseStatus,
  LessonDoc,
  OutlineItem,
} from "@shared/types";
import { db } from "./firebase/client";
import { deleteFile } from "./storage";

export type CourseWithId = CourseDoc & { id: string };
export type LessonWithId = LessonDoc & { id: string };

export class OutlineConflictError extends Error {
  constructor() {
    super("Le plan a été modifié ailleurs (autre onglet ?). Il a été rechargé.");
  }
}

/** Identifiant Firestore aléatoire (éléments du plan, leçons). */
export function newId(): string {
  return doc(collection(db, "courses")).id;
}

/** Firestore refuse `undefined` : on ne garde que les champs définis. */
export function normalizeItems(items: OutlineItem[]): OutlineItem[] {
  return items.map((item) => {
    const clean: OutlineItem = {
      id: item.id,
      kind: item.kind,
      title: item.title.trim() || "Sans titre",
    };
    if (item.kind === "lesson") {
      if (item.isPreview) clean.isPreview = true;
      if (item.hidden) clean.hidden = true;
      if (typeof item.durationSec === "number") clean.durationSec = item.durationSec;
    }
    return clean;
  });
}

export async function uniqueCourseSlug(creatorId: string, title: string, excludeCourseId?: string) {
  const base = slugify(title) || "formation";
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (isReservedSlug(candidate)) continue;
    const snap = await getDocs(
      query(
        collection(db, "courses"),
        where("creatorId", "==", creatorId),
        where("slug", "==", candidate),
        limit(2),
      ),
    );
    if (snap.docs.every((d) => d.id === excludeCourseId)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export async function isCourseSlugTaken(creatorId: string, slug: string, courseId: string) {
  const snap = await getDocs(
    query(
      collection(db, "courses"),
      where("creatorId", "==", creatorId),
      where("slug", "==", slug),
    ),
  );
  return snap.docs.some((d) => d.id !== courseId);
}

export async function createCourse(creatorId: string, title: string): Promise<string> {
  const courseRef = doc(collection(db, "courses"));
  const slug = await uniqueCourseSlug(creatorId, title);
  await setDoc(courseRef, {
    creatorId,
    title: title.trim(),
    slug,
    description: null,
    summary: "",
    thumbnailUrl: null,
    status: "draft",
    visibility: "visible",
    commentsMode: "active",
    items: [],
    outlineVersion: 0,
    salesPage: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, "courses", courseRef.id, "private", "settings"), {
    welcomeEmail: DEFAULT_WELCOME_EMAIL,
    externalCtaUrl: null,
  } satisfies CoursePrivateSettings);
  return courseRef.id;
}

type CourseEditableFields = Pick<
  CourseDoc,
  | "title"
  | "slug"
  | "description"
  | "summary"
  | "thumbnailUrl"
  | "visibility"
  | "commentsMode"
  | "salesPage"
  | "price"
>;

export async function updateCourse(courseId: string, patch: Partial<CourseEditableFields>) {
  await updateDoc(doc(db, "courses", courseId), { ...patch, updatedAt: serverTimestamp() });
}

function newLessonDoc(course: CourseDoc, courseId: string, item: OutlineItem) {
  return {
    creatorId: course.creatorId,
    courseId,
    courseStatus: course.status,
    isPreview: Boolean(item.isPreview),
    title: item.title,
    video: null,
    thumbnailUrl: null,
    body: null,
    links: [],
    attachments: [],
    updatedAt: serverTimestamp(),
  };
}

/**
 * Enregistre le plan (transaction) : crée, renomme ou supprime les documents de leçon
 * correspondants. Échoue si le plan a changé depuis `expectedVersion`.
 */
export async function saveOutline(
  courseId: string,
  expectedVersion: number,
  nextItems: OutlineItem[],
): Promise<number> {
  const items = normalizeItems(nextItems);
  const courseRef = doc(db, "courses", courseId);
  const removedAttachments: string[] = [];

  const version = await runTransaction(db, async (tx) => {
    const course = (await tx.get(courseRef)).data() as CourseDoc | undefined;
    if (!course) throw new Error("Formation introuvable");
    if (course.outlineVersion !== expectedVersion) throw new OutlineConflictError();

    const before = new Map(course.items.filter((i) => i.kind === "lesson").map((i) => [i.id, i]));
    const after = new Map(items.filter((i) => i.kind === "lesson").map((i) => [i.id, i]));
    const removed = [...before.keys()].filter((id) => !after.has(id));
    const removedDocs = await Promise.all(
      removed.map((id) => tx.get(doc(db, "courses", courseId, "lessons", id))),
    );
    removedDocs.forEach((snap) => {
      const lesson = snap.data() as LessonDoc | undefined;
      lesson?.attachments.forEach((attachment) => removedAttachments.push(attachment.path));
    });

    for (const [id, item] of after) {
      const lessonRef = doc(db, "courses", courseId, "lessons", id);
      const previous = before.get(id);
      if (!previous) {
        tx.set(lessonRef, newLessonDoc(course, courseId, item));
      } else if (
        previous.title !== item.title ||
        Boolean(previous.isPreview) !== Boolean(item.isPreview)
      ) {
        tx.update(lessonRef, {
          title: item.title,
          isPreview: Boolean(item.isPreview),
          updatedAt: serverTimestamp(),
        });
      }
    }
    removed.forEach((id) => tx.delete(doc(db, "courses", courseId, "lessons", id)));
    tx.update(courseRef, {
      items,
      outlineVersion: expectedVersion + 1,
      updatedAt: serverTimestamp(),
    });
    return expectedVersion + 1;
  });

  await Promise.allSettled(removedAttachments.map(deleteFile));
  return version;
}

export type LessonContentPatch = Pick<
  LessonDoc,
  "video" | "thumbnailUrl" | "body" | "links" | "attachments"
>;
export type LessonItemPatch = Pick<OutlineItem, "title" | "isPreview" | "hidden" | "durationSec">;

/** Enregistre une leçon : contenu protégé + élément du plan (titre, aperçu, masquage, durée). */
export async function saveLesson(
  courseId: string,
  lessonId: string,
  content: LessonContentPatch,
  itemPatch: LessonItemPatch,
): Promise<void> {
  const courseRef = doc(db, "courses", courseId);
  const lessonRef = doc(db, "courses", courseId, "lessons", lessonId);
  await runTransaction(db, async (tx) => {
    const course = (await tx.get(courseRef)).data() as CourseDoc | undefined;
    if (!course) throw new Error("Formation introuvable");
    if (!course.items.some((item) => item.id === lessonId))
      throw new Error("Leçon supprimée du plan");
    const items = normalizeItems(
      course.items.map((item) => (item.id === lessonId ? { ...item, ...itemPatch } : item)),
    );
    tx.update(lessonRef, {
      ...content,
      title: itemPatch.title.trim() || "Sans titre",
      isPreview: Boolean(itemPatch.isPreview),
      updatedAt: serverTimestamp(),
    });
    tx.update(courseRef, {
      items,
      outlineVersion: course.outlineVersion + 1,
      updatedAt: serverTimestamp(),
    });
  });
}

/** Publie / dépublie : met à jour la formation et la copie du statut sur chaque leçon. */
export async function setCourseStatus(course: CourseWithId, status: CourseStatus): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, "courses", course.id), { status, updatedAt: serverTimestamp() });
  course.items
    .filter((item) => item.kind === "lesson")
    .forEach((item) =>
      batch.update(doc(db, "courses", course.id, "lessons", item.id), {
        courseStatus: status,
        updatedAt: serverTimestamp(),
      }),
    );
  await batch.commit();
}

/** Supprime un brouillon et ses leçons. */
export async function deleteDraftCourse(course: CourseWithId): Promise<void> {
  if (course.status !== "draft") throw new Error("Dépublie la formation avant de la supprimer.");
  const lessons = await getDocs(collection(db, "courses", course.id, "lessons"));
  const batch = writeBatch(db);
  lessons.docs.forEach((lesson) => batch.delete(lesson.ref));
  batch.delete(doc(db, "courses", course.id, "private", "settings"));
  batch.delete(doc(db, "courses", course.id));
  await batch.commit();
}

export async function getCourseSettings(courseId: string): Promise<CoursePrivateSettings> {
  const snap = await getDoc(doc(db, "courses", courseId, "private", "settings"));
  return (
    (snap.data() as CoursePrivateSettings | undefined) ?? {
      welcomeEmail: DEFAULT_WELCOME_EMAIL,
      externalCtaUrl: null,
    }
  );
}

export async function saveCourseSettings(courseId: string, patch: Partial<CoursePrivateSettings>) {
  await setDoc(doc(db, "courses", courseId, "private", "settings"), patch, { merge: true });
}
