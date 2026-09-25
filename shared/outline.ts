import type { OutlineItem } from "./types";

/** Le plan d'une formation est une liste plate ordonnée : chapitre, sous-chapitre, leçon. */

export function lessonItems(items: OutlineItem[]): OutlineItem[] {
  return items.filter((item) => item.kind === "lesson");
}

/** Leçons visibles par les élèves, dans l'ordre. */
export function visibleLessons(items: OutlineItem[]): OutlineItem[] {
  return items.filter((item) => item.kind === "lesson" && !item.hidden);
}

export function adjacentLessons(
  items: OutlineItem[],
  lessonId: string,
): { prev: OutlineItem | null; next: OutlineItem | null } {
  const lessons = visibleLessons(items);
  const index = lessons.findIndex((lesson) => lesson.id === lessonId);
  if (index === -1) return { prev: null, next: null };
  return { prev: lessons[index - 1] ?? null, next: lessons[index + 1] ?? null };
}

export interface ChapterGroup {
  /** null pour les éléments placés avant le premier chapitre. */
  chapter: OutlineItem | null;
  /** Sous-chapitres et leçons du chapitre, dans l'ordre. */
  items: OutlineItem[];
  lessonCount: number;
}

/** Regroupe le plan par chapitre (affichage repliable). */
export function groupByChapter(
  items: OutlineItem[],
  { includeHidden = false } = {},
): ChapterGroup[] {
  const groups: ChapterGroup[] = [];
  let current: ChapterGroup | null = null;
  for (const item of items) {
    if (item.kind === "lesson" && item.hidden && !includeHidden) continue;
    if (item.kind === "chapter") {
      current = { chapter: item, items: [], lessonCount: 0 };
      groups.push(current);
      continue;
    }
    if (!current) {
      current = { chapter: null, items: [], lessonCount: 0 };
      groups.push(current);
    }
    current.items.push(item);
    if (item.kind === "lesson") current.lessonCount += 1;
  }
  return groups;
}

/** Nombre de leçons terminées parmi les leçons visibles actuelles. */
export function completedCount(items: OutlineItem[], completedLessonIds: string[]): number {
  const done = new Set(completedLessonIds);
  return visibleLessons(items).filter((lesson) => done.has(lesson.id)).length;
}

export function progressPercent(items: OutlineItem[], completedLessonIds: string[]): number {
  const total = visibleLessons(items).length;
  if (total === 0) return 0;
  return Math.round((completedCount(items, completedLessonIds) / total) * 100);
}

/** Retourne la liste des erreurs du plan (vide si valide). */
export function validateOutline(items: OutlineItem[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  let seenChapter = false;
  items.forEach((item, index) => {
    if (ids.has(item.id)) errors.push(`Identifiant en double : ${item.id}`);
    ids.add(item.id);
    if (!item.title.trim()) errors.push(`Élément ${index + 1} : titre manquant`);
    if (item.kind === "chapter") seenChapter = true;
    if (item.kind === "subchapter" && !seenChapter) {
      errors.push(`« ${item.title} » : un sous-chapitre doit suivre un chapitre`);
    }
  });
  return errors;
}

/** Première leçon non terminée (reprise), sinon la première leçon. */
export function resumeLesson(
  items: OutlineItem[],
  completedLessonIds: string[],
  lastLessonId: string | null,
): OutlineItem | null {
  const lessons = visibleLessons(items);
  if (lastLessonId) {
    const last = lessons.find((lesson) => lesson.id === lastLessonId);
    if (last && !completedLessonIds.includes(last.id)) return last;
  }
  const done = new Set(completedLessonIds);
  return lessons.find((lesson) => !done.has(lesson.id)) ?? lessons[0] ?? null;
}

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (!totalSeconds || totalSeconds <= 0) return "";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
