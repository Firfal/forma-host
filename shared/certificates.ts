import { visibleLessons } from "./outline";
import type { OutlineItem } from "./types";

/**
 * Certificats de réussite : délivrés par le serveur quand toutes les leçons visibles sont
 * terminées, vérifiables publiquement (/certificats/{id}). Désactivables par formation.
 */

/** certificates/{id} : lisible publiquement (page de vérification). */
export interface CertificateDoc<T = unknown> {
  courseId: string;
  courseTitle: string;
  schoolId: string;
  schoolName: string;
  studentUid: string;
  studentName: string;
  lessonCount: number;
  /** Durée totale des vidéos (secondes). */
  durationSec: number;
  issuedAt: T;
}

export interface IssueCertificateInput {
  courseId: string;
  /** Nom imprimé sur le certificat. */
  name: string;
}

/** Nom imprimé sur le certificat : message d'erreur, ou null s'il convient. */
export function certificateNameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2) return "Ton nom complet";
  if (trimmed.length > 80) return "80 caractères maximum";
  return null;
}

/** Certificat délivré par défaut, sauf si le formateur l'a désactivé. */
export function certificateEnabled(course: { certificate?: boolean }): boolean {
  return course.certificate !== false;
}

/** Toutes les leçons visibles terminées (et au moins une leçon). */
export function isCourseCompleted(items: OutlineItem[], completedLessonIds: string[]): boolean {
  const lessons = visibleLessons(items);
  const done = new Set(completedLessonIds);
  return lessons.length > 0 && lessons.every((lesson) => done.has(lesson.id));
}

/** « 3 h 20 de vidéo », « 45 min de vidéo », vide si inconnu. */
export function certificateDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return "";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (!hours) return `${minutes} min de vidéo`;
  return minutes
    ? `${hours} h ${String(minutes).padStart(2, "0")} de vidéo`
    : `${hours} h de vidéo`;
}
