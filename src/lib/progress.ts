import { arrayRemove, arrayUnion, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { enrollmentId } from "@shared/paths";
import { db } from "./firebase/client";

function enrollmentRef(courseId: string, uid: string) {
  return doc(db, "enrollments", enrollmentId(courseId, uid));
}

/** Marque une leçon comme terminée (ou non). Seul `progress` est modifiable par l'élève. */
export async function setLessonCompleted(
  courseId: string,
  uid: string,
  lessonId: string,
  completed: boolean,
) {
  await updateDoc(enrollmentRef(courseId, uid), {
    "progress.completedLessonIds": completed ? arrayUnion(lessonId) : arrayRemove(lessonId),
    "progress.lastLessonId": lessonId,
    "progress.lastActivityAt": serverTimestamp(),
  });
}

/** Mémorise la dernière leçon ouverte (reprise depuis « Mes formations »). */
export async function touchLesson(courseId: string, uid: string, lessonId: string) {
  await updateDoc(enrollmentRef(courseId, uid), {
    "progress.lastLessonId": lessonId,
    "progress.lastActivityAt": serverTimestamp(),
  });
}

/** Position de lecture vidéo, gardée dans le navigateur. */
const positionKey = (courseId: string, lessonId: string) =>
  `forma:position:${courseId}:${lessonId}`;

export function readVideoPosition(courseId: string, lessonId: string): number {
  try {
    return Number(window.localStorage.getItem(positionKey(courseId, lessonId))) || 0;
  } catch {
    return 0;
  }
}

export function writeVideoPosition(courseId: string, lessonId: string, seconds: number) {
  try {
    window.localStorage.setItem(positionKey(courseId, lessonId), String(Math.floor(seconds)));
  } catch {
    // Stockage indisponible (navigation privée) : pas de reprise, sans conséquence.
  }
}
