import { z } from "zod";
import { groupByChapter, visibleLessons } from "./outline";
import type { OutlineItem } from "./types";

/**
 * Ouverture progressive des leçons (Détails de la formation) :
 * - sequential : une leçon s'ouvre quand la précédente est terminée ;
 * - schedule : un chapitre s'ouvre tous les `intervalDays` jours après l'inscription.
 * C'est un rythme pédagogique affiché à l'élève (l'équipe de l'école voit tout).
 */
export const dripSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("sequential") }),
  z.object({ mode: z.literal("schedule"), intervalDays: z.number().int().min(1).max(90) }),
]);
export type DripSettings = z.infer<typeof dripSchema>;

export type LessonLock =
  | { reason: "sequential"; previousLessonId: string; previousTitle: string }
  | { reason: "date"; availableAt: Date };

const DAY = 86_400_000;

/** Leçons encore fermées pour l'élève (absentes de la carte : ouvertes). */
export function lessonLocks(params: {
  items: OutlineItem[];
  drip: DripSettings | null | undefined;
  joinedAt: Date | null;
  completedLessonIds: string[];
  now?: Date;
}): Map<string, LessonLock> {
  const locks = new Map<string, LessonLock>();
  const { drip } = params;
  if (!drip) return locks;
  const done = new Set(params.completedLessonIds);

  if (drip.mode === "sequential") {
    const lessons = visibleLessons(params.items);
    lessons.forEach((lesson, index) => {
      const previous = lessons[index - 1];
      if (previous && !done.has(previous.id) && !done.has(lesson.id)) {
        locks.set(lesson.id, {
          reason: "sequential",
          previousLessonId: previous.id,
          previousTitle: previous.title,
        });
      }
    });
    return locks;
  }

  if (!params.joinedAt) return locks;
  const now = (params.now ?? new Date()).getTime();
  const start = new Date(params.joinedAt);
  start.setHours(0, 0, 0, 0);
  groupByChapter(params.items).forEach((group, index) => {
    const availableAt = new Date(start.getTime() + index * drip.intervalDays * DAY);
    if (availableAt.getTime() <= now) return;
    for (const item of group.items) {
      if (item.kind === "lesson" && !item.hidden && !done.has(item.id)) {
        locks.set(item.id, { reason: "date", availableAt });
      }
    }
  });
  return locks;
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

/** « Disponible le 12 octobre », « Termine « Intro » pour débloquer ». */
export function lockLabel(lock: LessonLock): string {
  return lock.reason === "date"
    ? `Disponible le ${dateFormatter.format(lock.availableAt)}`
    : `Termine « ${lock.previousTitle} » pour débloquer`;
}
