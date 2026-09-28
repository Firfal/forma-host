import {
  collection,
  deleteDoc,
  doc,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { useMemo } from "react";
import { noteId, type LessonNoteDoc } from "@shared/notes";
import type { TimestampLike } from "@shared/types";
import { db } from "./firebase/client";
import { useDocData, useQueryData } from "./hooks";

const noteRef = (uid: string, courseId: string, lessonId: string) =>
  doc(db, "users", uid, "notes", noteId(courseId, lessonId));

export function useLessonNote(uid: string | null | undefined, courseId: string, lessonId: string) {
  const ref = useMemo(
    () => (uid ? noteRef(uid, courseId, lessonId) : null),
    [uid, courseId, lessonId],
  );
  return useDocData<LessonNoteDoc<TimestampLike>>(ref);
}

/** Notes de l'élève sur une formation (liste « Mes notes »). */
export function useCourseNotes(uid: string | null | undefined, courseId: string) {
  const notesQuery = useMemo(
    () =>
      uid ? query(collection(db, "users", uid, "notes"), where("courseId", "==", courseId)) : null,
    [uid, courseId],
  );
  return useQueryData<LessonNoteDoc<TimestampLike>>(notesQuery);
}

/** Enregistre la note (une note vidée est supprimée). */
export async function saveLessonNote(
  uid: string,
  note: { courseId: string; lessonId: string; lessonTitle: string; text: string },
): Promise<void> {
  const ref = noteRef(uid, note.courseId, note.lessonId);
  if (!note.text.trim()) {
    await deleteDoc(ref);
    return;
  }
  await setDoc(ref, {
    courseId: note.courseId,
    lessonId: note.lessonId,
    lessonTitle: note.lessonTitle.slice(0, 200),
    text: note.text,
    updatedAt: serverTimestamp(),
  });
}
