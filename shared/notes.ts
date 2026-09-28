/**
 * Notes personnelles d'un élève sur une leçon : users/{uid}/notes/{formation}_{leçon}, lisibles
 * par lui seul (pas même par l'école). Enregistrées automatiquement pendant la saisie.
 */

export const NOTE_MAX = 20_000;
/** Délai après la dernière frappe avant l'enregistrement (ms). */
export const NOTE_SAVE_DELAY = 800;

export interface LessonNoteDoc<T = unknown> {
  courseId: string;
  lessonId: string;
  /** Titre de la leçon au moment de l'écriture (liste « Mes notes »). */
  lessonTitle: string;
  text: string;
  updatedAt: T;
}

export const noteId = (courseId: string, lessonId: string) => `${courseId}_${lessonId}`;

/** Extrait d'une note pour la liste (première ligne non vide, raccourcie). */
export function noteExcerpt(text: string, max = 140): string {
  const line = text
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) return "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}
