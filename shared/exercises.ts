import { z } from "zod";

/**
 * Exercices à rendre : sur une leçon, l'élève envoie une vidéo, une image, un PDF ou un lien ;
 * l'équipe de l'école répond par des retours, horodatés sur la vidéo.
 */

export const SUBMISSION_MAX_MB = 500;
export const EXERCISE_LIMITS = { instructions: 3000, note: 2000, feedback: 3000 } as const;

/** lessons/{id}.exercise : consignes de l'exercice (null : pas d'exercice). */
export interface LessonExercise {
  instructions: string;
}

export type SubmissionStatus = "submitted" | "reviewed";

export interface SubmissionFile {
  path: string;
  name: string;
  size: number;
  contentType: string;
}

/** submissions/{id} : lisible par l'élève et l'équipe de l'école. */
export interface SubmissionDoc<T = unknown> {
  courseId: string;
  creatorId: string;
  lessonId: string;
  lessonTitle: string;
  uid: string;
  studentName: string;
  file: SubmissionFile | null;
  link: string | null;
  note: string;
  status: SubmissionStatus;
  createdAt: T;
  reviewedAt: T | null;
  /** Dernier retour (mis à jour par le serveur). */
  lastFeedbackAt: T | null;
}

/** submissions/{id}/feedback/{id} : retour du formateur ou réponse de l'élève. */
export interface FeedbackDoc<T = unknown> {
  authorUid: string;
  authorName: string;
  /** Moment de la vidéo concerné (secondes), null si général. */
  atSec: number | null;
  body: string;
  createdAt: T;
}

const ACCEPTED = /^(video\/|image\/(png|jpeg|gif|webp)$|application\/pdf$)/;

/** Problème bloquant du fichier envoyé (message pour l'élève), null si accepté. */
export function submissionFileError(file: { type: string; size: number }): string | null {
  if (!ACCEPTED.test(file.type))
    return "Formats acceptés : vidéo, image (PNG, JPEG, GIF, WEBP) ou PDF.";
  if (file.size > SUBMISSION_MAX_MB * 1024 * 1024)
    return `Fichier trop lourd (${SUBMISSION_MAX_MB} Mo maximum). Partage plutôt un lien.`;
  return null;
}

export const submissionLinkSchema = z
  .string()
  .trim()
  .max(2000, "Lien trop long")
  .url("Lien invalide (il doit commencer par https://)")
  .refine((url) => /^https?:\/\//.test(url), "Lien invalide (il doit commencer par https://)");

export type SubmissionMedia = "video" | "image" | "pdf" | "link";

export function submissionMedia(submission: Pick<SubmissionDoc, "file" | "link">): SubmissionMedia {
  const type = submission.file?.contentType ?? "";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  return "link";
}

/** « 1:05 », « 1:02:09 ». */
export function formatTimecode(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  submitted: "À corriger",
  reviewed: "Corrigé",
};
